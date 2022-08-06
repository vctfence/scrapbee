import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_GROUP, NODE_TYPE_NOTES, RDF_EXTERNAL_NAME} from "./storage.js";
import {Archive, Node} from "./storage_entities.js";
import {Query} from "./storage_query.js";
import {
    injectCSSFile,
    injectScriptFile,
    openContainerTab,
    openPage,
    showNotification,
    updateTabURL
} from "./utils_browser.js";
import {settings} from "./settings.js";
import {nativeBackend} from "./backend_native.js";
import {send, sendLocal} from "./proxy.js";
import {rdfBackend} from "./backend_rdf.js";
import {Bookmark} from "./bookmarks_bookmark.js";

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
        await injectScriptFile(tab.id, {file: "lib/jquery.js", frameId: 0});
        if (!_BACKGROUND_PAGE)
            await injectScriptFile(tab.id, {file: "lib/browser-polyfill.js", frameId: 0});
        await injectScriptFile(tab.id, {file: "ui/edit_toolbar.js", frameId: 0});

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
    return archives.reduce((acc, n) => {
        acc[n.uri] = n.uuid;
        return acc;
    }, {});
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

function openURL(url, options, newtabf = openPage) {
    if (options?.tab)
        return updateTabURL(options.tab, url, options.preserveHistory);

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
    const helperApp = await nativeBackend.probe(true);

    if (helperApp) {
        const helperApp11 = await nativeBackend.hasVersion("1.1");
        if (!helperApp11)
            await rdfBackend.pushRDFPath(node);

        const url = nativeBackend.url(`/rdf/browse/${node.uuid}/_#${node.uuid}:${node.id}:${node.external_id}`);
        return openURL(url, options);
    }
}

export async function getHelperAppRdfPathMessage(uuid) {
    const node = await Node.getByUUID(uuid);
    const path = await rdfBackend.getRDFPageDir(node);
    return {
        type: "RDF_PATH",
        uuid: node.uuid,
        rdf_directory: path
    };
}

async function getBlobURL(node, blob) {
    if (settings.browse_with_helper()) {
        const alertText = _BACKGROUND_PAGE? "Scrapyard helper application v1.1+ is required.": undefined;
        const helperApp = await nativeBackend.hasVersion("1.1", alertText);

        if (helperApp)
            return nativeBackend.url(`/browse/${node.uuid}`);
        else
            return loadArchive(blob);
    }

    return loadArchive(blob);
}

export async function getHelperAppPushBlobMessage(uuid) {
    const node = await Node.getByUUID(uuid)
    const archive = await Archive.get(node.id);
    const content = await Archive.reify(archive, true);
    return {
        type: "PUSH_BLOB",
        uuid: node.uuid,
        content_type: archive.type || "text/html",
        content: content,
        byte_length: archive.byte_length || null
    };
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

export async function browseNodeInCurrentContext(node, options) {
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

export async function browseNode(node) {
    if (_BACKGROUND_PAGE)
        return browseNodeInCurrentContext(node);
    else
        return sendLocal.browseNode({node});
}
