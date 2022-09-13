import {settings} from "./settings.js";
import {
    getActiveTab,
    hasCSRPermission,
    injectCSSFile,
    injectScriptFile,
    showNotification,
    isHTMLTab, askCSRPermission
} from "./utils_browser.js";
import {capitalize, getMimetypeExt} from "./utils.js";
import {receive, send, sendLocal} from "./proxy.js";
import {DEFAULT_SHELF_ID, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "./storage.js";
import {fetchText, fetchWithTimeout} from "./utils_io.js";
import {Node} from "./storage_entities.js";
import {getFaviconFromContent, getFaviconFromTab} from "./favicon.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import * as crawler from "./crawler.js";
import {Folder} from "./bookmarks_folder.js";
import {isHTMLLink, parseHtml} from "./utils_html.js";
import {findSidebarWindow, toggleSidebarWindow} from "./utils_sidebar.js";

export function formatShelfName(name) {
    if (name && settings.capitalize_builtin_shelf_names())
        return capitalize(name);

    return name;
}

export function isSpecialPage(url) {
    return (url.startsWith("about:")
        || url.startsWith("view-source:") || url.startsWith("moz-extension:")
        || url.startsWith("https://addons.mozilla.org") || url.startsWith("https://support.mozilla.org")
        || url.startsWith("chrome:") || url.startsWith("chrome-extension:")
        || url.startsWith("https://chrome.google.com/webstore"));
}

export function notifySpecialPage() {
    showNotification("Scrapyard cannot be used with special pages.");
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
    if (isSpecialPage(tab.url))
        notifySpecialPage();
    else {
        if (await isHTMLTab(tab))
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
            selection = await browser.tabs.sendMessage(
                tab.id,
                {type: "CAPTURE_SELECTION", options: bookmark},
                {frameId: frame.frameId}
            );

            if (selection)
                break;
        } catch (e) {
            console.error(e);
        }
    }

    return selection;
}

async function captureHTMLTab(tab, bookmark) {
    if (!_BACKGROUND_PAGE)
        await injectScriptFile(tab.id, {file: "/lib/browser-polyfill.js", allFrames: true});

    let response;
    const selection = await extractSelection(tab, bookmark);
    try { response = await startSavePageCapture(tab, bookmark, selection); } catch (e) {}

    if (typeof response == "undefined") { /* no response received - content script not loaded in active tab */
        let onScriptInitialized = async (message, sender) => {
            if (message.type === "CAPTURE_SCRIPT_INITIALIZED" && tab.id === sender.tab.id) {
                browser.runtime.onMessage.removeListener(onScriptInitialized);

                try {
                    response = await startSavePageCapture(tab, bookmark, selection);
                } catch (e) {
                    console.error(e);
                }

                if (typeof response == "undefined")
                    showNotification("Cannot initialize capture script, please retry.");

            }
        };
        browser.runtime.onMessage.addListener(onScriptInitialized);

        await injectSavePageScripts(tab)
    }
}

function startSavePageCapture(tab, bookmark, selection) {
    return browser.tabs.sendMessage(tab.id, {
        type: "performAction",
        menuaction: 1,
        saveditems: 2,
        bookmark,
        selection
    });
}

async function injectSavePageScripts(tab, onError) {
    if (!await hasCSRPermission())
        return;

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

        if (onError)
            onError(e);
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

            await Bookmark.storeArchive(bookmark, await response.arrayBuffer(), contentType);
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
    else if (bookmark && !bookmark.__automation && !bookmark.__type_change)
        send.bookmarkAdded({node: bookmark});
}

export async function archiveBookmark(node) {
    const bookmark = await Node.get(node.id);
    bookmark.type = NODE_TYPE_ARCHIVE;
    await Node.update(bookmark);

    const isHTML = await isHTMLLink(bookmark.uri);
    if (isHTML === true) {
        bookmark.__type_change = true;
        await packPage(bookmark.uri, bookmark, () => null, () => null, false);
    }
    else if (isHTML === false) {
        let response;
        try {
            response = await fetchWithTimeout(bookmark.uri);
        } catch (e) {
            console.error(e);
        }

        if (response.ok)
           await Bookmark.storeArchive(bookmark, await response.blob(), response.headers.get("content-type"));
    }
}

export async function showSiteCaptureOptions(tab, bookmark) {
    try {
        if (!_BACKGROUND_PAGE)
            await injectScriptFile(tab.id, {file: "/lib/browser-polyfill.js", allFrames: true});

        await injectScriptFile(tab.id, {file: "/savepage/content-frame.js", allFrames: true});
        await injectCSSFile(tab.id, {file: "/ui/site_capture_content.css"});
        await injectScriptFile(tab.id, {file: "/ui/site_capture_content.js", frameId: 0});
        browser.tabs.sendMessage(tab.id, {type: "storeBookmark", bookmark});
    } catch (e) {
        console.error(e);
    }
}

export async function performSiteCapture(bookmark) {
    if (crawler.initialize(bookmark)) {
        const folder = await Folder.addSite(bookmark.parent_id, bookmark.name);
        bookmark.parent_id = folder.id;

        sendLocal.createArchive({node: bookmark});
    }
}

export function startCrawling(bookmark) {
    bookmark.__site_capture.level = 0;

    crawler.crawl(bookmark);

    send.startProcessingIndication({noWait: true});
    send.toggleAbortMenu({show: true});
}

export function abortCrawling() {
    crawler.abort();
}

export async function packPage(url, bookmark, initializer, resolver, hide_tab) {
    return new Promise(async (resolve, reject) => {
        let initializationListener;
        let changedTab;
        let packing;

        let completionListener = function (message, sender, sendResponse) {
            if (message.type === "storePageHtml" && message.bookmark.__tab_id === packingTab.id) {
                removeListeners();
                browser.tabs.remove(packingTab?.id);

                resolve(resolver(message, changedTab));
            }
        };

        let tabRemovedListener = function (tabId) {
            if (tabId === changedTab.id) {
                removeListeners();
                const message = {bookmark};
                resolve(resolver(message, changedTab));
            }
        };

        browser.runtime.onMessage.addListener(completionListener);

        var tabUpdateListener = async (id, changed, tab) => {
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
                        if (initializer)
                            await initializer(bookmark, tab);
                        bookmark.__tab_id = packingTab.id;

                        try {
                            await startSavePageCapture(packingTab, bookmark);
                        } catch (e) {
                            console.error(e);
                            reject(e);
                        }
                    }
                };

                browser.runtime.onMessage.addListener(initializationListener);

                if (!_BACKGROUND_PAGE)
                    await injectScriptFile(packingTab.id, {file: "/lib/browser-polyfill.js", allFrames: true});

                await injectSavePageScripts(packingTab, reject);
            }
        };

        function removeListeners() {
            browser.tabs.onUpdated.removeListener(tabUpdateListener);
            browser.tabs.onRemoved.removeListener(tabRemovedListener);
            browser.runtime.onMessage.removeListener(completionListener);
            browser.runtime.onMessage.removeListener(initializationListener);
        }

        browser.tabs.onUpdated.addListener(tabUpdateListener);
        browser.tabs.onRemoved.addListener(tabRemovedListener);

        var packingTab = await browser.tabs.create({url: url, active: false});

        if (hide_tab)
            browser.tabs.hide(packingTab.id)
    });
}

export async function packUrl(url, hide_tab) {
    return packPage(url, {}, b => b.__url_packing = true, m => m.data, hide_tab);
}

export async function packUrlExt(url, hide_tab) {
    let resolver = (m, t) => ({html: m.data, title: url.endsWith(t.title)? undefined: t.title, icon: t.favIconUrl});
    return packPage(url, {}, b => b.__url_packing = true, resolver, hide_tab);
}

export function addBookmarkOnCommand(command) {
    let action = command === "archive_to_default_shelf"? "createArchive": "createBookmark";

    if (settings.platform.firefox)
        addBookmarkOnCommandFirefox(action);
    else
        addBookmarkOnCommandNonFirefox(action);
}

function addBookmarkOnCommandFirefox(action) {
    if (localStorage.getItem("option-open-sidebar-from-shortcut") === "open") {
        localStorage.setItem("sidebar-select-shelf", DEFAULT_SHELF_ID);
        browser.sidebarAction.open();
    }

    if (action === "createArchive")
        askCSRPermission()// requires non-async function
            .then(response => {
                if (response)
                    addBookmarkOnCommandSendPayload(action);
            })
            .catch(e => console.error(e));
    else
        addBookmarkOnCommandSendPayload(action);
}

async function addBookmarkOnCommandNonFirefox(action) {
    const payload = await getActiveTabMetadata();
    await addBookmarkOnCommandSendPayload(action, payload);

    await settings.load();
    if (settings.open_sidebar_from_shortcut()) {
        const window = await findSidebarWindow();
        if (!window) {
            await browser.storage.session.set({"sidebar-select-shelf": DEFAULT_SHELF_ID});
            await toggleSidebarWindow();
        }
    }
}

async function addBookmarkOnCommandSendPayload(action, payload) {
    if (!payload)
        payload = await getActiveTabMetadata();

    payload.parent_id = DEFAULT_SHELF_ID;
    return sendLocal[action]({node: payload});
}

export async function createBookmarkFromURL (url, parentId) {
    let options = {
        parent_id: parentId,
        uri: url,
        name: "Untitled"
    };

    if (!/^https?:\/\/.*/.exec(options.uri))
        options.uri = "http://" + options.uri;

    sendLocal.startProcessingIndication();

    try {
        const html = await fetchText(options.uri);
        let doc;
        if (html)
            doc = parseHtml(html);

        if (doc) {
            const title = doc.getElementsByTagName("title")[0]?.textContent;
            options.name = title || options.uri;

            const icon = await getFaviconFromContent(options.uri, doc);
            if (icon)
                options.icon = icon;
        }
    }
    catch (e) {
        console.error(e);
    }

    const bookmark = await Bookmark.add(options, NODE_TYPE_BOOKMARK);
    await sendLocal.stopProcessingIndication();
    sendLocal.bookmarkCreated({node: bookmark});
}
