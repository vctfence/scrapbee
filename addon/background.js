import {isSpecialShelf, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES, RDF_EXTERNAL_NAME} from "./db.js";
import {backend, browserBackend} from "./backend.js";
import {
    exportOrg,
    exportJSON,
    importOrg,
    importJSON,
    importHtml,
    importRDF,
    instantiateLinkedResources, SCRAPYARD_LOCK_SCREEN
} from "./import.js";
import {settings} from "./settings.js";
import {isSpecialPage, loadLocalResource, notifySpecialPage, readFile, showNotification, withIDBFile} from "./utils.js";

export async function browseNode(node, external_tab, preserve_history) {

    switch (node.type) {
        case NODE_TYPE_BOOKMARK:
            let url = node.uri;
            if (url) {
                try {
                    new URL(url);
                }
                catch (e) {
                    url = "http://" + url;
                }
            }

            return (external_tab
                        ? browser.tabs.update(external_tab.id, {"url": url, "loadReplace": !preserve_history})
                        : browser.tabs.create({"url": url}));

        case NODE_TYPE_ARCHIVE:
            if (node.external === RDF_EXTERNAL_NAME) {
                let path = await backend.computePath(node.id);
                let rdf_directory = path[0].uri;
                let base = `file://${rdf_directory}/data/${node.external_id}/`;
                let index = `${base}index.html`;

                let html = await loadLocalResource(index);

                if (!html.data) {
                    showNotification({message: "Cannot find: " + index});
                    return;
                }

                html = html.data.replace(/<body([^>]*)>/, `<body\$1>${SCRAPYARD_LOCK_SCREEN}`);

                let urls = [];

                html = await instantiateLinkedResources(html, base, urls, 0);

                let blob = new Blob([new TextEncoder().encode(html)], {type: "text/html"});
                let url = URL.createObjectURL(blob);

                urls.push(url);

                let completionListener = function(message,sender,sendResponse) {
                    if (message.type === "BROWSE_PAGE_HTML" && message.payload.tab_id === rdf_tab.id) {
                        browser.runtime.onMessage.removeListener(completionListener);

                        for (let url of urls) {
                            URL.revokeObjectURL(url);
                        }
                    }
                };

                browser.runtime.onMessage.addListener(completionListener);

                let listener = async (id, changed, tab) => {
                    if (id === rdf_tab.id && changed.status === "complete") {
                        let initializationListener = async function(message, sender, sendResponse) {
                            if (message.type === "CAPTURE_SCRIPT_INITIALIZED" && sender.tab.id === rdf_tab.id) {
                                browser.runtime.onMessage.removeListener(initializationListener);

                                node.__local_import = true;
                                node.__local_browsing = true;
                                node.__local_import_base = base;
                                node.tab_id = rdf_tab.id;

                                await browser.tabs.sendMessage(rdf_tab.id, {
                                    type: "performAction",
                                    menuaction: 2,
                                    payload: node
                                });
                            }
                        };
                        browser.runtime.onMessage.addListener(initializationListener);

                        browser.tabs.onUpdated.removeListener(listener);
                        try {
                            try {
                                await browser.tabs.executeScript(tab.id, {file: "savepage/content-frame.js", allFrames: true});
                            } catch (e) {}

                            await browser.tabs.executeScript(tab.id, {file: "savepage/content.js"});
                        }
                        catch (e) {
                            console.log(e);
                            showNotification({message: "Error loading page"});
                        }
                    }
                };

                browser.tabs.onUpdated.addListener(listener);

                let rdf_tab = await (external_tab
                                        ? browser.tabs.update(external_tab.id, {"url": url, "loadReplace": !preserve_history})
                                        : browser.tabs.create({"url": url}));
                return;
            }

            return backend.fetchBlob(node.id).then(blob => {
                if (blob) {

                    if (blob.byte_length) {
                        let byteArray = new Uint8Array(blob.byte_length);
                        for (let i = 0; i < blob.data.length; ++i)
                            byteArray[i] = blob.data.charCodeAt(i);

                        blob.data = byteArray;
                    }

                    let object = new Blob([blob.data], {type: blob.type? blob.type: "text/html"});
                    let objectURL = URL.createObjectURL(object);
                    let archiveURL = objectURL + "#" + node.uuid + ":" + node.id;

                    return (external_tab
                                ? browser.tabs.update(external_tab.id, {"url": archiveURL, "loadReplace": !preserve_history})
                                : browser.tabs.create({"url": archiveURL}))
                            .then(tab => {
                                let listener = (id, changed, tab) => {
                                    if (id === tab.id && changed.status === "complete") {
                                        browser.tabs.onUpdated.removeListener(listener);
                                        browser.tabs.executeScript(tab.id, {
                                            file: "edit-bootstrap.js",
                                        });
                                        URL.revokeObjectURL(objectURL);
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
                        ? browser.tabs.update(external_tab.id, {"url": "notes.html#" + node.uuid + ":" + node.id,
                                                                "loadReplace": !preserve_history})
                        : browser.tabs.create({"url": "notes.html#" + node.uuid + ":" + node.id}));
    }
}


/* Internal message listener */

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    let shelf;
    switch (message.type) {
        case "CREATE_BOOKMARK":
            if (isSpecialPage(message.data.uri)) {
                notifySpecialPage();
                return;
            }

            backend.addBookmark(message.data, NODE_TYPE_BOOKMARK).then(bookmark => {
                browser.runtime.sendMessage({type: "BOOKMARK_CREATED", node: bookmark});
            });
            break;

        case "COPY_NODES":
            return backend.copyNodes(message.node_ids, message.dest_id);

        case "MOVE_NODES":
            return backend.moveNodes(message.node_ids, message.dest_id);

        case "DELETE_NODES":
            return backend.deleteNodes(message.node_ids);

        case "REORDER_NODES":
            return backend.reorderNodes(message.positions);

        case "BROWSE_NODE":
            browseNode(message.node, message.tab, message.preserveHistory);
            break;

        case "BROWSE_NOTES":
            (message.tab
                ? browser.tabs.update(message.tab.id, {"url": "notes.html#" + message.uuid + ":" + message.id,
                                                       "loadReplace": true})
                : browser.tabs.create({"url": "notes.html#" + message.uuid + ":" + message.id}));
            break;

        case "BROWSE_ORG_REFERENCE":
            location.href = message.link;
            break;

        case "IMPORT_FILE":
            shelf = isSpecialShelf(message.file_name)? message.file_name.toLocaleLowerCase(): message.file_name;

            let importf = ({"JSON": async () => importJSON(shelf, message.file),
                            "ORG":  async () => importOrg(shelf, await readFile(message.file)),
                            "HTML": async () => importHtml(shelf, await readFile(message.file)),
                            "RDF": async () => importRDF(shelf, message.file, message.threads, message.quick)})
                [message.file_ext.toUpperCase()];

            return backend.importTransaction(importf);

        case "EXPORT_FILE":
            shelf = isSpecialShelf(message.shelf) ? message.shelf.toLocaleLowerCase() : message.shelf;

            let format = settings.export_format()? settings.export_format(): "json";
            let exportf = format === "json"? exportJSON: exportOrg;
            let idb = await withIDBFile(`export/${new Date().getTime()}/${shelf}.${format}`, "readwrite",
                async (handle, file, store) =>
                    exportf(handle, message.nodes, message.shelf, message.uuid, settings.shallow_export(),
                        settings.compress_export()));

            let file_name = message.shelf.replace(/[\\\/:*?"<>|\[\]()^#%&!@:+={}'~]/g, "_") + `.${format}`;
            let url = URL.createObjectURL(await idb.file.getFile());
            let download = await browser.downloads.download({url: url, filename: file_name, saveAs: false});
            let download_listener = delta => {
                if (delta.id === download && delta.state && delta.state.current === "complete") {
                    browser.downloads.onChanged.removeListener(download_listener);
                    URL.revokeObjectURL(url);
                    idb.store.clear();
                }
            };
            browser.downloads.onChanged.addListener(download_listener);
            break;

        case "UI_LOCK_GET":
            browserBackend.getUILock();
            break;

        case "UI_LOCK_RELEASE":
            browserBackend.releaseUILock();
            break;

        case "GET_LISTENER_LOCK_STATE":
            return browserBackend.isListenerLocked();

        case "RECONCILE_BROWSER_BOOKMARK_DB":
            settings.load(s => {
                backend.reconcileBrowserBookmarksDB();
            });
            break;
        case "RECONCILE_CLOUD_BOOKMARK_DB":
            settings.load(s => {
                backend.reconcileCloudBookmarksDB();
            });
            break;

        case "ENABLE_CLOUD_BACKGROUND_SYNC":
            settings.load(s => {
                startCloudBackgroundSync(s);
            });
            break;
    }
});

function startCloudBackgroundSync(s) {
    if (s.cloud_background_sync())
        window._backgroundSyncInterval = setInterval(
            () => backend.reconcileCloudBookmarksDB(),
            15 * 60 * 1000);
    else
        if (window._backgroundSyncInterval)
            clearInterval(window._backgroundSyncInterval);
}

settings.load(async s => {
    await backend.reconcileBrowserBookmarksDB();
    startCloudBackgroundSync(s);
});

console.log("==> background.js loaded");
