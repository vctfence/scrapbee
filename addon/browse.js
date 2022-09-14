import {
    CLOUD_EXTERNAL_TYPE,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_FOLDER,
    NODE_TYPE_NOTES,
    RDF_EXTERNAL_TYPE
} from "./storage.js";
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
import {helperApp} from "./helper_app.js";
import {send, sendLocal} from "./proxy.js";
import {rdfShelf} from "./plugin_rdf_shelf.js";
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

async function configureArchivePage_v1(tab, node) {
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

async function configureArchivePage(tab, node) {
    await injectCSSFile(tab.id, {file: "ui/edit_toolbar.css"});
    await injectScriptFile(tab.id, {file: "lib/jquery.js", frameId: 0});
    if (!_BACKGROUND_PAGE)
        await injectScriptFile(tab.id, {file: "lib/browser-polyfill.js", frameId: 0});
    await injectScriptFile(tab.id, {file: "ui/edit_toolbar.js", frameId: 0});

    if (settings.open_bookmark_in_active_tab()) {
        const uuid = tab.url.split("/").at(-1);
        node = await Node.getByUUID(uuid);
    }

    if (await Bookmark.isSitePage(node))
        await configureSiteLinks(node, tab);
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

async function browseArchive_v1(node, options) {
    if (node.__tentative)
        return;

    if (node.external === RDF_EXTERNAL_TYPE)
        return await browseRDFArchive(node, options);

    const blob = await Archive.get(node);
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

async function browseArchive(node, options) {
    if (node.__tentative)
        return;

    if (node.external === RDF_EXTERNAL_TYPE)
        return await browseRDFArchive(node, options);

    const archiveURL = helperApp.url(`/browse/${node.uuid}`);
    const archiveTab = await openURL(archiveURL, options);
    return configureArchiveTab(node, archiveTab);
}

helperApp.addMessageHandler("REQUEST_ARCHIVE", onRequestArchiveMessage);

export async function onRequestArchiveMessage(msg) {
    const node = await Node.getByUUID(msg.uuid)
    const result = {type: "ARCHIVE_INFO", kind: "empty"};

    if (node.external === CLOUD_EXTERNAL_TYPE) {
        try {
            const archive = await Archive.get(node);

            if (archive) {
                const content = await Archive.reify(archive, true);

                result.kind = "content";
                result.content_type = archive.type || "text/html";
                result.content = content;
                result.byte_length = archive.byte_length || null;
            }
        } catch (e) {
            console.error(e);
        }
    }
    else {
        result.kind = "data_path";
        result.data_path = settings.data_folder_path() || null;
    }

    return result;
}

async function browseRDFArchive(node, options) {
    const helper = await helperApp.probe(true);

    if (helper) {
        const helperApp11 = await helperApp.hasVersion("1.1");
        if (!helperApp11)
            await rdfShelf.pushRDFPath(node);

        const url = helperApp.url(`/rdf/browse/${node.uuid}/_#${node.uuid}:${node.id}:${node.external_id}`);
        return openURL(url, options);
    }
}

export async function onRequestRdfPathMessage(msg) {
    const node = await Node.getByUUID(msg.uuid);
    const path = await rdfShelf.getRDFPageDir(node);
    return {
        type: "RDF_PATH",
        uuid: node.uuid,
        rdf_directory: path
    };
}

helperApp.addMessageHandler("REQUEST_RDF_PATH", onRequestRdfPathMessage);

async function getBlobURL(node, blob) {
    if (settings.browse_with_helper()) {
        const alertText = _BACKGROUND_PAGE? "Scrapyard helper application v1.1+ is required.": undefined;
        const helper = await helperApp.hasVersion("1.1", alertText);

        if (helper)
            return helperApp.url(`/browse/${node.uuid}`);
        else
            return loadArchive(blob);
    }

    return loadArchive(blob);
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

async function browseFolder(node, options) {
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

        case NODE_TYPE_FOLDER:
            return browseFolder(node, options);
    }
}

export async function browseNode(node) {
    if (_BACKGROUND_PAGE)
        return browseNodeInCurrentContext(node);
    else
        return sendLocal.browseNode({node});
}
