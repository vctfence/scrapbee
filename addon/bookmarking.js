import {settings} from "./settings.js";
import {
    getActiveTab, injectCSSFile, injectScriptFile,
    openContainerTab,
    openPage,
    scriptsAllowed,
    showNotification,
    updateTab
} from "./utils_browser.js";
import {capitalize, getMimetypeExt} from "./utils.js";
import {send} from "./proxy.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_GROUP, NODE_TYPE_NOTES, RDF_EXTERNAL_NAME} from "./storage.js";
import {nativeBackend} from "./backend_native.js";
import {fetchWithTimeout} from "./utils_io.js";
import {Archive} from "./storage_entities.js";
import {rdfBackend} from "./backend_rdf.js";
import {getFaviconFromTab} from "./favicon.js";
import {Bookmark} from "./bookmarks_bookmark.js";

export function formatShelfName(name) {
    if (name && settings.capitalize_builtin_shelf_names())
        return capitalize(name);

    return name;
}

export function isSpecialPage(url) {
    return (url.startsWith("about:")
        || url.startsWith("view-source:") || url.startsWith("moz-extension:")
        || url.startsWith("https://addons.mozilla.org") || url.startsWith("https://support.mozilla.org")
        /*|| url.substr(0, 17) === "chrome-extension:" || url.substr(0, 34) === "https://chrome.google.com/webstore"*/);
}

export function notifySpecialPage() {
    showNotification("Scrapyard cannot be used with special pages:\n" +
        "about:, moz-extension:, " + "view-source:\n" +
        "https://addons.mozilla.org, https://support.mozilla.org\n"
        /* + "chrome:, chrome-extension:,\n" +
        "https://chrome.google.com/webstore,\n" */
    );
}

export async function getTabMetadata(tab) {
    const result = {
        name: tab.title,
        uri:  tab.url
    };

    const favicon = await getFaviconFromTab(tab);
    if (favicon)
        result.icon = favicon;

    return result;
}

export async function getActiveTabMetadata() {
    const tab = await getActiveTab();
    return await getTabMetadata(tab);
}

export async function captureTab(tab, bookmark) {
    if (isSpecialPage(tab.url)) {
        notifySpecialPage();
    }
    else {
        if (await scriptsAllowed(tab.id))
            await captureHTMLTab(tab, bookmark)
        else
            await captureNonHTMLTab(tab, bookmark);
    }
}

async function extractSelection(tab, bookmark) {
    const frames = await browser.webNavigation.getAllFrames({tabId: tab.id});
    let selection;

    for (let frame of frames) {
        try {
            await injectScriptFile(tab.id, {file: "/content_selection.js", frameId: frame.frameId});

            selection = await browser.tabs.sendMessage(tab.id, {type: "CAPTURE_SELECTION", options: bookmark});

            if (selection)
                break;
        } catch (e) {
            console.error(e);
        }
    }

    return selection;
}

async function captureHTMLTab(tab, bookmark) {

    async function savePageCapture() {
        return browser.tabs.sendMessage(tab.id, {
            type: "performAction",
            menuaction: 1,
            saveditems: 2,
            selection: await extractSelection(tab, bookmark),
            bookmark: bookmark
        });
    }

    let response;
    try { response = await savePageCapture(); } catch (e) {}

    if (typeof response == "undefined") { /* no response received - content script not loaded in active tab */
        let onScriptInitialized = async (message, sender) => {
            if (message.type === "CAPTURE_SCRIPT_INITIALIZED" && tab.id === sender.tab.id) {
                browser.runtime.onMessage.removeListener(onScriptInitialized);

                try {
                    response = await savePageCapture();
                } catch (e) {
                    console.error(e)
                }

                if (typeof response == "undefined")
                    showNotification("Cannot initialize capture script, please retry.");

            }
        };
        browser.runtime.onMessage.addListener(onScriptInitialized);

        try {
            try {
                await injectScriptFile(tab.id, {file: "/savepage/content-frame.js", allFrames: true});
            } catch (e) {
                console.error(e);
            }

            await injectScriptFile(tab.id, {file: "/savepage/content.js"});
        }
        catch (e) {
            console.error(e);
        }
    }
}

async function captureNonHTMLTab(tab, bookmark) {
    try {
        const headers = {"Cache-Control": "no-store"};
        const response = await fetchWithTimeout(tab.url, {timeout: 60000, headers});

        if (response.ok) {
            let contentType = response.headers.get("content-type");

            if (!contentType)
                contentType = getMimetypeExt(new URL(tab.url).pathname) || "application/pdf";

            bookmark.content_type = contentType;

            await Bookmark.storeArchive(bookmark.id, await response.arrayBuffer(), contentType);
        }
    }
    catch (e) {
        console.error(e);
    }

    finalizeCapture(bookmark);
}

export function finalizeCapture(bookmark) {
    if (bookmark?.__automation && bookmark?.select)
        send.bookmarkCreated({node: bookmark});
    else if (bookmark && !bookmark.__automation)
        send.bookmarkAdded({node: bookmark});
}

export async function packPage(url, bookmark, initializer, resolver, hide_tab) {
    return new Promise(async (resolve, reject) => {
        let initializationListener;
        let changedTab;
        let packing;

        let completionListener = function (message, sender, sendResponse) {
            if (message.type === "storePageHtml" && message.bookmark.__tab_id === packingTab.id) {
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
                        await injectScriptFile(tab.id, {
                            file: "savepage/content-frame.js",
                            allFrames: true
                        });
                    } catch (e) {
                        console.error(e);
                    }

                    await injectScriptFile(packingTab.id, {file: "savepage/content.js"});
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

function showEditToolbar(archiveTab) {
    // Tab may be automatically reloaded if charset encoding is not found in first 1024 bytes
    // A twisted logic is necessary to load the editor toolbar in this case
    // This may happen if a large favicon is the first tag under the <head>
    // Corrected version of page capture solves this problem by forcing encoding meta to be the first tag
    // But for existing pages a workaround is necessary

    let configureTab = async tab => {
        browser.tabs.onUpdated.removeListener(listener)

        await injectCSSFile(tab.id, {file: "ui/edit_toolbar.css"});
        await injectScriptFile(tab.id, {file: "lib/jquery.js"});
        await injectScriptFile(tab.id, {file: "ui/edit_toolbar.js"});
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
        if (tab.id === archiveTab.id) {
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
                let helperApp = await nativeBackend.hasVersion("0.5");

                if (helperApp) {
                    await rdfBackend.pushRDFPath(node);
                    const url = nativeBackend.url(`/rdf/browse/${node.uuid}/_#${node.uuid}:${node.id}:${node.external_id}`);
                    return openUrl(url);
                }
                else {
                    showNotification(`Scrapyard helper application v0.5+ is required.`);
                    return;
                }
            }

            return Archive.get(node.id).then(async blob => {
                if (blob) {
                    let objectURL = null;
                    let helperApp = false;

                    if (settings.browse_with_helper()) {
                        helperApp = await nativeBackend.hasVersion("0.5");
                        if (helperApp) {
                            const blob = await Archive.get(node.id);
                            const data = await Archive.reify(blob, true);

                            const fields = {
                                blob: data,
                                content_type: blob.type || "text/html",
                            };

                            if (blob.byte_length) {
                                fields.blob = btoa(fields.blob);
                                fields.byte_length = blob.byte_length;
                            }

                            await nativeBackend.post(`/browse/upload/${node.uuid}`, fields);
                            objectURL = nativeBackend.url(`/browse/${node.uuid}`);
                        }
                        else {
                            showNotification(`Scrapyard helper application v0.5+ is required.`);
                            return;
                        }
                    }

                    if (!objectURL) {
                        if (blob.data) { // legacy string content
                            let object = new Blob([await Archive.reify(blob)],
                                {type: blob.type? blob.type: "text/html"});
                            objectURL = URL.createObjectURL(object);
                        }
                        else
                            objectURL = URL.createObjectURL(blob.object);
                    }

                    const archiveURL = objectURL + "#" + node.uuid + ":" + node.id;
                    const archiveTab = await openUrl(archiveURL);
                    showEditToolbar(archiveTab);

                    if (!helperApp)
                        URL.revokeObjectURL(objectURL);
                }
                else {
                    showNotification({message: "No data is stored."});
                }
            });

        case NODE_TYPE_NOTES:
            return openUrl("ui/notes.html#" + node.uuid + ":" + node.id);

        case NODE_TYPE_GROUP:
            if (node.__filtering)
                send.selectNode({node, open: true, forceScroll: true});
    }
}
