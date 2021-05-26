import {settings} from "./settings.js";
import {openContainerTab, openPage, showNotification, updateTab} from "./utils_browser.js";
import {getMimetypeExt} from "./utils.js";
import {backend} from "./backend.js";
import {send} from "./proxy.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES, RDF_EXTERNAL_NAME} from "./storage.js";
import {nativeBackend} from "./backend_native.js";

export function formatShelfName(name) {
    return settings.capitalize_builtin_shelf_names()? name?.capitalize(): name;
}

export function isSpecialPage(url) {
    return (url.substr(0, 6) === "about:" /*|| url.substr(0, 7) === "chrome:"*/
        || url.substr(0, 12) === "view-source:" || url.substr(0, 14) === "moz-extension:"
        || url.substr(0, 26) === "https://addons.mozilla.org" /*|| url.substr(0, 17) === "chrome-extension:"
        || url.substr(0, 34) === "https://chrome.google.com/webstore"*/);
}

export function notifySpecialPage() {
    showNotification("Scrapyard cannot be used with special pages:\n" +
        "about:, moz-extension:, " + "view-source:\n" +
        "https://addons.mozilla.org, https://support.mozilla.org\n"
        /* + "chrome:, chrome-extension:,\n" +
        "https://chrome.google.com/webstore,\n" */
    );
}

export async function captureTab(tab, bookmark) {
    if (isSpecialPage(tab.url)) {
        notifySpecialPage();
    }
    else {
        // Acquire selection html, if presents

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

export async function browseNode(node, external_tab, preserve_history, container) {

    const openUrl = (url, newtabf = openPage, container) => {
        return (external_tab
            ? updateTab(external_tab, url, preserve_history)
            : newtabf(url, container));
    };

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

                return openUrl(url, openContainerTab, container);
            }

            break;

        case NODE_TYPE_ARCHIVE:

            if (node.__tentative)
                return;

            if (node.external === RDF_EXTERNAL_NAME) {
                let helperApp = await nativeBackend.probe(true);

                if (helperApp) {
                    const url = nativeBackend.url(`/rdf/browse/${node.uuid}/_#${node.uuid}:${node.id}:${node.external_id}`);
                    return openUrl(url);
                }
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
                                {type: blob.type? blob.type: "text/html"});
                            objectURL = URL.createObjectURL(object);
                        }
                        else
                            objectURL = URL.createObjectURL(blob.object);
                    }

                    let archiveURL = objectURL + "#" + node.uuid + ":" + node.id;

                    return openUrl(archiveURL)
                        .then(archive_tab => {

                            // Tab may be automatically reloaded if charset encoding is not found in first 1024 bytes
                            // A twisted logic is necessary to load the editor toolbar in this case
                            // This may happen if a large favicon is the first tag under the <head>
                            // Corrected version of page capture solves this problem by forcing encoding meta to be the first tag
                            // But for existing pages a workaround is necessary

                            let configureTab = async tab => {
                                browser.tabs.onUpdated.removeListener(listener)

                                await browser.tabs.insertCSS(tab.id, {file: "ui/edit_toobar.css"});
                                await browser.tabs.executeScript(tab.id, {file: "lib/jquery.js"});
                                await browser.tabs.executeScript(tab.id, {file: "ui/edit_toolbar.js"});

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
            return openUrl("ui/notes.html#" + node.uuid + ":" + node.id);
    }
}
