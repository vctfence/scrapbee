import {formatBytes, getMimetypeExt} from "./utils.js";
import {backend} from "./backend.js";
import {send} from "./proxy.js";
import {
    CLOUD_SHELF_ID,
    DEFAULT_POSITION,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_NOTES,
    RDF_EXTERNAL_NAME
} from "./storage_constants.js";
import {getActiveTab, openContainerTab, showNotification} from "./utils_browser.js";
import {nativeBackend} from "./backend_native.js";
import {settings} from "./settings.js";

export function createBookmark(data) {
    if (isSpecialPage(data.uri)) {
        notifySpecialPage();
        return;
    }

    const addBookmark = () =>
        backend.addBookmark(data, NODE_TYPE_BOOKMARK).then(bookmark => {
            send.bookmarkAdded({node: bookmark});
        });

    backend.setTentativeId(data);
    send.beforeBookmarkAdded({node: data})
        .then(addBookmark)
        .catch(addBookmark);
}

export function createArchive(data) {
    if (isSpecialPage(data.uri)) {
        notifySpecialPage();
        return;
    }

    let addBookmark = () =>
        backend.addBookmark(data, NODE_TYPE_ARCHIVE)
            .then(bookmark => {
                getActiveTab().then(tab => {
                    bookmark.__tab_id = tab.id;
                    captureTab(tab, bookmark);
                });
            });

    backend.setTentativeId(data);
    send.beforeBookmarkAdded({node: data})
        .then(addBookmark)
        .catch(addBookmark);
}

export async function getBookmarkInfo(message) {
    let node = await backend.getNode(message.id);
    node.__formatted_size = node.size ? formatBytes(node.size) : null;
    node.__formatted_date = node.date_added
        ? node.date_added.toString().replace(/:[^:]*$/, "")
        : null;
    return node;
}

export function shareBookmarkToCloud(message) {
    return backend.copyNodes(message.node_ids, CLOUD_SHELF_ID)
        .then(async newNodes => {
            newNodes = newNodes.filter(n => message.node_ids.some(id => id === n.old_id));
            for (let n of newNodes) {
                n.pos = DEFAULT_POSITION;
                await backend.updateNode(n);
            }
            await backend.updateExternalBookmarks(newNodes);
        });
}

export function isSpecialPage(url) {
    return (url.substr(0, 6) === "about:" || url.substr(0, 7) === "chrome:"
        || url.substr(0, 12) === "view-source:" || url.substr(0, 14) === "moz-extension:"
        || url.substr(0, 26) === "https://addons.mozilla.org" || url.substr(0, 17) === "chrome-extension:"
        || url.substr(0, 34) === "https://chrome.google.com/webstore");
}

export function notifySpecialPage() {
    showNotification("Scrapyard cannot be used with special pages:\n" +
        "about:, moz-extension:,\n" +
        "https://addons.mozilla.org,\n" +
        "chrome:, chrome-extension:,\n" +
        "https://chrome.google.com/webstore,\n" +
        "view-source:");
}

export async function captureTab(tab, bookmark) {
    if (isSpecialPage(tab.url)) {
        notifySpecialPage();
    }
    else {
        // Acquire selection html, if present

        let selection;
        let frames = await browser.webNavigation.getAllFrames({tabId: tab.id});

        for (let frame of frames) {
            try {
                await browser.tabs.executeScript(tab.id, {file: "/selection.js", frameId: frame.frameId});

                selection = await browser.tabs.sendMessage(tab.id, {type: "CAPTURE_SELECTION", options: bookmark});

                if (selection)
                    break;
            } catch (e) {
                console.error(e);
            }
        }

        let response;
        let initiateCapture = () => browser.tabs.sendMessage(tab.id, {
            type: "performAction",
            menuaction: 1,
            saveditems: 2,
            selection: selection,
            bookmark: bookmark
        });

        try {
            response = await initiateCapture();
        } catch (e) {
        }

        if (typeof response == "undefined") { /* no response received - content script not loaded in active tab */
            let onScriptInitialized = async (message, sender) => {
                if (message.type === "CAPTURE_SCRIPT_INITIALIZED" && tab.id === sender.tab.id) {
                    browser.runtime.onMessage.removeListener(onScriptInitialized);

                    try {
                        response = await initiateCapture();
                    } catch (e) {
                        console.error(e)
                    }

                    if (typeof response == "undefined")
                        alertNotify("Cannot initialize capture script, please retry.");

                }
            };
            browser.runtime.onMessage.addListener(onScriptInitialized);

            try {
                try {
                    await browser.tabs.executeScript(tab.id, {file: "/savepage/content-frame.js", allFrames: true});
                } catch (e) {
                    console.error(e);
                }

                await browser.tabs.executeScript(tab.id, {file: "/savepage/content.js"});
            } catch (e) {
                // capture of binary files

                let xhr = new XMLHttpRequest();

                xhr.open("GET", tab.url, true);
                xhr.setRequestHeader("Cache-Control", "no-store");

                xhr.responseType = "arraybuffer";
                xhr.timeout = maxResourceTime * 1000;
                xhr.onerror = function (e) {
                    console.error(e)
                };
                xhr.onloadend = function () {
                    if (this.status === 200) {
                        let contentType = this.getResponseHeader("Content-Type");
                        if (contentType == null) {
                            const url = new URL(tab.url);
                            contentType = getMimetypeExt(url.pathname) || "application/pdf";
                        }

                        backend.storeBlob(bookmark.id, this.response, contentType);

                        send.bookmarkAdded({node: bookmark});
                    }
                };

                xhr.send()
            }
        }
    }
}

export async function packPage(url, bookmark, initializer, resolver, hide_tab) {
    return new Promise(async (resolve, reject) => {
        let initializationListener;
        let changedTab;
        let packing;

        let completionListener = function (message, sender, sendResponse) {
            if (message.type === "STORE_PAGE_HTML" && message.bookmark.__tab_id === packingTab.id) {
                browser.tabs.onUpdated.removeListener(listener);
                browser.runtime.onMessage.removeListener(completionListener);
                browser.runtime.onMessage.removeListener(initializationListener);
                browser.tabs.remove(packingTab.id);

                resolve(resolver(message, changedTab));
            }
        };

        browser.runtime.onMessage.addListener(completionListener);

        var listener = async (id, changed, tab) => {
            if (!changedTab && id === packingTab.id)
                changedTab = tab;
            if (id === packingTab.id && changed.favIconUrl)
                changedTab.favIconUrl = changed.favIconUrl;
            if (id === packingTab.id && changed.title)
                changedTab.title = changed.title;
            if (id === packingTab.id && changed.status === "complete") { // may be invoked several times
                if (packing)
                    return;
                packing = true;

                initializationListener = async function (message, sender, sendResponse) {
                    if (message.type === "CAPTURE_SCRIPT_INITIALIZED" && sender.tab.id === packingTab.id) {
                        await initializer(bookmark, tab);
                        bookmark.__tab_id = packingTab.id;

                        try {
                            await browser.tabs.sendMessage(packingTab.id, {
                                type: "performAction",
                                menuaction: 1,
                                saveditems: 2,
                                bookmark: bookmark
                            });
                        } catch (e) {
                            console.error(e);
                            reject(e);
                        }
                    }
                };

                browser.runtime.onMessage.addListener(initializationListener);

                try {
                    try {
                        await browser.tabs.executeScript(tab.id, {
                            file: "savepage/content-frame.js",
                            allFrames: true
                        });
                    } catch (e) {
                        console.error(e);
                    }

                    await browser.tabs.executeScript(packingTab.id, {file: "savepage/content.js"});
                } catch (e) {
                    reject(e);
                }
            }
        };

        browser.tabs.onUpdated.addListener(listener);

        var packingTab = await browser.tabs.create({url: url, active: false});

        if (hide_tab)
            browser.tabs.hide(packingTab.id)
    });
}

export async function packUrl(url, hide_tab) {
    return packPage(url, {}, b => b.__page_packing = true, m => m.data, hide_tab);
}

export async function packUrlExt(url, hide_tab) {
    let resolver = (m, t) => ({html: m.data, title: url.endsWith(t.title)? undefined: t.title, icon: t.favIconUrl});
    return packPage(url, {}, b => b.__page_packing = true, resolver, hide_tab);
}

export function storePageHtml(message) {
    if (message.bookmark.__page_packing)
        return;

    backend.storeBlob(message.bookmark.id, message.data, "text/html")
        .then(() => {
            if (!message.bookmark.__mute_ui) {
                browser.tabs.sendMessage(message.bookmark.__tab_id, {type: "UNLOCK_DOCUMENT"});

                if (message.bookmark?.__automation && message.bookmark?.select)
                    send.bookmarkCreated({node: message.bookmark});
                else if (message.bookmark && !message.bookmark.__automation)
                    send.bookmarkAdded({node: message.bookmark});
            }
        })
        .catch(e => {
            console.error(e);
            if (!message.bookmark.__mute_ui) {
                chrome.tabs.sendMessage(message.bookmark.__tab_id, {type: "UNLOCK_DOCUMENT"});
                alertNotify("Error archiving page.");
            }
        });
}

export async function uploadFiles(message) {
    send.startProcessingIndication();

    const helperApp = nativeBackend.probe(true);
    if (helperApp) {
        const uuids = await nativeBackend.fetchJSON("/upload/open_file_dialog");

        for (const [uuid, file] of Object.entries(uuids)) {
            const url =  nativeBackend.url(`/serve/file/${uuid}/`);
            const isHtml = /\.html?$/i.test(file);

            let bookmark = {uri: "", parent_id: message.parent_id};

            bookmark.name = file.replaceAll("\\", "/").split("/");
            bookmark.name = bookmark.name[bookmark.name.length - 1];

            let content;
            let contentType = getMimetypeExt(file);

            try {
                if (isHtml) {
                    const page = await packUrlExt(url);
                    bookmark.name = page.title || bookmark.name;
                    bookmark.icon = page.icon;
                    content = page.html;
                }
                else {
                    const response = await fetch(url);
                    if (response.ok) {
                        contentType = response.headers.get("content-type") || contentType;
                        content = await response.arrayBuffer();
                    }
                }

                bookmark = await backend.addBookmark(bookmark, NODE_TYPE_ARCHIVE);
                if (content)
                    await backend.storeBlob(bookmark.id, content, contentType);
                else
                    throw new Error();
            }
            catch (e) {
                console.error(e);
                showNotification(`Can not upload ${bookmark.name}`);
            }

            await nativeBackend.fetch(`/serve/release_path/${uuid}`);
        }

        if (Object.entries(uuids).length)
            send.nodesUpdated();
    }

    send.stopProcessingIndication();
}

export async function browseNode(node, external_tab, preserve_history, container) {

    switch (node.type) {
        case NODE_TYPE_BOOKMARK:
            let url = node.uri;
            if (url) {
                try {
                    new URL(url);
                } catch (e) {
                    url = "http://" + url;
                }

                container = container || node.container;

                return (external_tab
                    ? browser.tabs.update(external_tab.id, {"url": url, "loadReplace": !preserve_history})
                    : openContainerTab(url, container));
            }

            break;

        case NODE_TYPE_ARCHIVE:

            if (node.__tentative)
                return;

            if (node.external === RDF_EXTERNAL_NAME) {
                let helperApp = await nativeBackend.probe(true);

                if (!helperApp)
                    return;

                let url = nativeBackend.url(`/rdf/browse/${node.uuid}/_#${node.uuid}:${node.id}:${node.external_id}`);

                let rdf_tab = await (external_tab
                    ? browser.tabs.update(external_tab.id, {"url": url, "loadReplace": !preserve_history})
                    : browser.tabs.create({"url": url}));
                return;
            }

            return backend.fetchBlob(node.id).then(async blob => {
                if (blob) {
                    let objectURL = null;
                    let helperApp = false;

                    if (settings.browse_with_helper()) {
                        helperApp = await nativeBackend.probe(true);
                        if (helperApp)
                            objectURL = nativeBackend.url(`/browse/${node.uuid}`);
                    }

                    if (!objectURL) {
                        if (blob.data) { // legacy string content
                            let object = new Blob([await backend.reifyBlob(blob)],
                                {type: blob.type ? blob.type : "text/html"});
                            objectURL = URL.createObjectURL(object);
                        }
                        else
                            objectURL = URL.createObjectURL(blob.object);
                    }

                    let archiveURL = objectURL + "#" + node.uuid + ":" + node.id;

                    return (external_tab
                        ? browser.tabs.update(external_tab.id, {"url": archiveURL, "loadReplace": !preserve_history})
                        : browser.tabs.create({"url": archiveURL}))
                        .then(archive_tab => {

                            // Tab may be automatically reloaded if charset encoding is not found in first 1024 bytes
                            // A twisted logic is necessary to load the editor toolbar in this case
                            // This may happen if a large favicon is the first tag under the <head>
                            // Corrected version of page capture solves this problem by forcing encoding meta to be the first tag
                            // But for existing pages a workaround is necessary

                            let configureTab = async tab => {
                                browser.tabs.onUpdated.removeListener(listener)

                                await browser.tabs.insertCSS(tab.id, {file: "edit.css"});
                                await browser.tabs.executeScript(tab.id, {file: "lib/jquery.js"});
                                await browser.tabs.executeScript(tab.id, {file: "edit-content.js"});

                                if (!helperApp)
                                    URL.revokeObjectURL(objectURL);
                            };

                            let completed = false;
                            let retryTimeout;
                            let retries = 0;
                            let lastState;
                            let urlChanges = 0;

                            let checkStatus = tab => {
                                if (lastState === "complete") { // OK, the page is loaded, show toolbar
                                    configureTab(tab);
                                }
                                else if (lastState !== "complete" && retries < 3) { // Wait 3 more seconds
                                    retries += 1;
                                    retryTimeout = setTimeout(() => checkStatus(tab), 1000);
                                }
                                else {
                                    configureTab(tab); // Try to show the toolbar and remove the listener
                                }
                            };

                            var listener = async (id, changed, tab) => {
                                if (tab.id === archive_tab.id) {
                                    // Register first completed state, "loading" states will follow if the tab is reloaded
                                    if (!completed)
                                        completed = changed.status === "complete";

                                    // Register URL change events, there should be more than one if the tab is reloaded
                                    if (changed.url)
                                        urlChanges += 1;

                                    // This should work for the most of properly captured well-formed pages
                                    if (changed.status === "complete" && tab.title !== tab.url) {
                                        clearTimeout(retryTimeout);
                                        configureTab(tab);
                                    }
                                    // This should work for reloaded pages without <title> tag
                                    else if (changed.status === "complete" && urlChanges > 1) {
                                        clearTimeout(retryTimeout);
                                        configureTab(tab);
                                    }
                                    // This should work for non-reloaded pages without <title> tag
                                    else if (completed) {
                                        // Continue to register states
                                        lastState = changed.status;
                                        clearTimeout(retryTimeout);
                                        // When changes halted more than for one second, check if the last state is "complete"
                                        retryTimeout = setTimeout(() => checkStatus(tab), 1000);
                                    }
                                }
                            };

                            browser.tabs.onUpdated.addListener(listener);
                        });
                }
                else {
                    showNotification({message: "No data is stored."});
                }
            });

        case NODE_TYPE_NOTES:
            return (external_tab
                ? browser.tabs.update(external_tab.id, {
                    "url": "notes.html#" + node.uuid + ":" + node.id,
                    "loadReplace": !preserve_history
                })
                : browser.tabs.create({"url": "notes.html#" + node.uuid + ":" + node.id}));
    }
}

export function browseNotes(message) {
    (message.tab
        ? browser.tabs.update(message.tab.id, {
            "url": "notes.html#" + message.uuid + ":" + message.id,
            "loadReplace": true
        })
        : browser.tabs.create({"url": "notes.html#" + message.uuid + ":" + message.id}));
}
