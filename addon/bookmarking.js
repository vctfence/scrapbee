import {settings} from "./settings.js";
import {
    getActiveTab, injectCSSFile, injectScriptFile,
    openContainerTab,
    openPage,
    scriptsAllowed,
    showNotification,
    updateTab
} from "./utils_browser.js";
import {capitalize, getMimetypeExt, sleep} from "./utils.js";
import {send, sendLocal} from "./proxy.js";
import {
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP,
    NODE_TYPE_NOTES,
    RDF_EXTERNAL_NAME
} from "./storage.js";
import {nativeBackend} from "./backend_native.js";
import {fetchWithTimeout} from "./utils_io.js";
import {Archive, Node} from "./storage_entities.js";
import {rdfBackend} from "./backend_rdf.js";
import {getFaviconFromTab} from "./favicon.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import * as crawler from "./crawler.js";
import {Group} from "./bookmarks_group.js";
import {Query} from "./storage_query.js";
import {isHTMLLink} from "./utils_html.js";

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
    if (isSpecialPage(tab.url))
        notifySpecialPage();
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
           await Bookmark.storeArchive(bookmark.id, await response.blob(), response.headers.get("content-type"));
    }
}

export async function showSiteCaptureOptions(tab, bookmark) {
    try {
        await injectCSSFile(tab.id, {file: "/ui/site_capture_content.css"});
        await injectScriptFile(tab.id, {file: "/ui/site_capture_content.js", frameId: 0});
        browser.tabs.sendMessage(tab.id, {type: "storeBookmark", bookmark});

        await injectScriptFile(tab.id, {file: "/savepage/content-frame.js", allFrames: true});
        const message = {type: "requestFrames", siteCapture: true, siteCaptureOptions: true};
        setTimeout(() => browser.tabs.sendMessage(tab.id, message), 500);

    } catch (e) {
        console.error(e);
    }
}

export async function performSiteCapture(bookmark) {
    if (crawler.initialize(bookmark)) {
        const group = await Group.addSite(bookmark.parent_id, bookmark.name);
        bookmark.parent_id = group.id;

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

function configureArchiveTab(node, archiveTab) {
    var tabUpdateListener = async (id, changed, tab) => {
        if (tab.id === archiveTab.id) {
            if (changed?.hasOwnProperty("attention"))
                return;

            if (changed.status === "complete")
                configureArchivePage(tab, node);
        }
    };

    browser.tabs.onUpdated.addListener(tabUpdateListener);

    function tabRemoveListener(tabId) {
        if (tabId === archiveTab.id) {
            revokeTrackedObjectURLs(tabId);

            browser.tabs.onRemoved.removeListener(tabRemoveListener);
            browser.tabs.onUpdated.removeListener(tabUpdateListener);
        }
    }

    browser.tabs.onRemoved.addListener(tabRemoveListener);
}

async function configureArchivePage(tab, node) {
    if (archiveTabs[tab.id]?.has(tab.url.replace(/#.*$/, ""))) {
        await injectCSSFile(tab.id, {file: "ui/edit_toolbar.css"});
        await injectScriptFile(tab.id, {file: "lib/jquery.js"});
        await injectScriptFile(tab.id, {file: "ui/edit_toolbar.js"});

        if (settings.open_bookmark_in_active_tab())
            node = await Node.getByUUID(tab.url.replace(/^.*#/, "").split(":")[0])

        if (await Bookmark.isSitePage(node))
            await configureSiteLinks(node, tab);
    }
}

async function configureSiteLinks(node, tab) {
    await injectScriptFile(tab.id, {file: "content_site.js", allFrames: true});
    const siteMap = await buildSiteMap(node);
    browser.tabs.sendMessage(tab.id, {type: "CONFIGURE_SITE_LINKS", siteMap});
}

async function buildSiteMap(node) {
    const archives = await listSiteArchives(node);
    return archives.reduce((acc, n) => {acc[n.uri] = n.uuid; return acc;}, {});
}

var archiveTabs = {};

function trackArchiveTab(tabId, url) {
    let urls = archiveTabs[tabId];
    if (!urls) {
        urls = new Set([url]);
        archiveTabs[tabId] = urls;
    }
    else
        urls.add(url);
}

function isArchiveTabTracked(tabId) {
    return !!archiveTabs[tabId];
}

function revokeTrackedObjectURLs(tabId) {
    const objectURLs = archiveTabs[tabId];

    if (objectURLs) {
        delete archiveTabs[tabId];

        for (const url of objectURLs)
            if (url.startsWith("blob:"))
                URL.revokeObjectURL(url);
    }
}

export async function browseNode(node, options) {
    switch (node.type) {
        case NODE_TYPE_BOOKMARK:
            return browseBookmark(node, options);

        case NODE_TYPE_ARCHIVE:
            return browseArchive(node, options);

        case NODE_TYPE_NOTES:
            return openURL("ui/notes.html#" + node.uuid + ":" + node.id, options);

        case NODE_TYPE_GROUP:
            return browseGroup(node, options);
    }
}

function openURL(url, options, newtabf = openPage) {
    if (options?.tab)
        return updateTab(options.tab, url, options.preserveHistory);

    return newtabf(url, options?.container);
}

function browseBookmark(node, options) {
    let url = node.uri;
    if (url) {
        try {
            new URL(url);
        } catch (e) {
            url = "http://" + url;
        }

        if (options)
            options.container = options.container || node.container;
        else
            options = {container: node.container};

        return openURL(url, options, openContainerTab);
    }
}

async function browseArchive(node, options) {
    if (node.__tentative)
        return;

    if (node.external === RDF_EXTERNAL_NAME)
        return await browseRDFArchive(node, options);

    const blob = await Archive.get(node.id);
    if (blob) {
        let objectURL = await getBlobURL(node, blob);

        if (objectURL) {
            const archiveURL = objectURL + "#" + node.uuid + ":" + node.id;
            const archiveTab = await openURL(archiveURL, options);
            const tabTracked = isArchiveTabTracked(archiveTab.id);

            // configureArchiveTab depends on the tracked url
            trackArchiveTab(archiveTab.id, objectURL);

            if (!tabTracked)
                configureArchiveTab(node, archiveTab);
        }
    }
    else
        showNotification({message: "No data is stored."});
}

async function browseRDFArchive(node, options) {
    let helperApp = await nativeBackend.hasVersion("0.5", "Scrapyard helper application v0.5+ is required.");

    if (helperApp) {
        await rdfBackend.pushRDFPath(node);
        const url = nativeBackend.url(`/rdf/browse/${node.uuid}/_#${node.uuid}:${node.id}:${node.external_id}`);
        return openURL(url, options);
    }
}

async function getBlobURL(node, blob) {
    if (settings.browse_with_helper()) {
        const helperApp = await nativeBackend.hasVersion("0.5", "Scrapyard helper application v0.5+ is required.");

        if (helperApp)
            return sendBlobToBackend(node, blob);
        else
            return null;
    }

    return loadArchive(blob);
}

async function sendBlobToBackend(node, blob) {
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
    return nativeBackend.url(`/browse/${node.uuid}`);
}

async function loadArchive(blob) {
    if (blob.data) { // legacy string content
        let object = new Blob([await Archive.reify(blob)],
            {type: blob.type? blob.type: "text/html"});
        return URL.createObjectURL(object);
    }
    else
        return URL.createObjectURL(blob.object);
}

async function browseGroup(node, options) {
    if (node.__filtering)
        send.selectNode({node, open: true, forceScroll: true});
    else if (node.site) {
        const archives = await listSiteArchives(node);
        const page = archives[0];
        if (page)
            return browseArchive(page, options);
    }
}

async function listSiteArchives(node) {
    const parentId = node.type === NODE_TYPE_ARCHIVE? node.parent_id: node.id;
    const parent = await Node.get(parentId);
    const pages = await Query.fullSubtree(parent.id, true);
    return pages.filter(n => n.type === NODE_TYPE_ARCHIVE);
}
