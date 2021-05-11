import {backend} from "./backend.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud.js";
import {nativeBackend} from "./backend_native.js";
import {ishellBackend} from "./backend_ishell.js";
import {settings} from "./settings.js";
import * as search from "./search.js";
import {send} from "./proxy.js";

import {
    exportOrg,
    exportJSON,
    importOrg,
    importJSON,
    importHtml,
    importRDF
} from "./import.js";

import {
    formatBytes,
    isSpecialPage,
    notifySpecialPage,
    openContainerTab,
    readFile, ReadLine,
    showNotification,
    stringByteLengthUTF8
} from "./utils.js";

import {
    CLOUD_SHELF_ID,
    DEFAULT_POSITION,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_NOTES,
    RDF_EXTERNAL_NAME,
    isSpecialShelf, EVERYTHING, DEFAULT_SHELF_ID, DEFAULT_SHELF_NAME
} from "./storage_constants.js";
import UUID from "./lib/uuid.js";

export async function browseNode(node, external_tab, preserve_history, container) {

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
                                let listener = async (id, changed, tab) => {
                                    if (tab.id === archive_tab.id && changed.status === "complete") {
                                        browser.tabs.onUpdated.removeListener(listener);

                                        await browser.tabs.insertCSS(tab.id, {file: "edit.css"})

                                        let code = `var __scrapyardHideToolbar = ${settings.do_not_show_archive_toolbar()}`;
                                        await browser.tabs.executeScript(tab.id, {code: code})

                                        await browser.tabs.executeScript(tab.id, {file: "lib/jquery.js"})
                                        await browser.tabs.executeScript(tab.id, {file: "edit-content.js"})

                                        if (!helperApp)
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

            const addBookmark = () =>
                backend.addBookmark(message.data, NODE_TYPE_BOOKMARK).then(bookmark => {
                    send.bookmarkAdded({node: bookmark});
                });

            backend.setTentativeId(message.data);
            send.beforeBookmarkAdded({node: message.data})
                .then(addBookmark)
                .catch(addBookmark);

            break;

        case "GET_BOOKMARK_INFO":
            let node = await backend.getNode(message.id);
            node.__formatted_size = formatBytes(node.size);
            node.__formatted_date = node.date_added.toString().replace(/:[^:]*$/, "");
            return node;

        case "COPY_NODES":
            return backend.copyNodes(message.node_ids, message.dest_id);

        case "SHARE_TO_CLOUD":
            return backend.copyNodes(message.node_ids, CLOUD_SHELF_ID)
                .then(async newNodes => {
                    newNodes = newNodes.filter(n => message.node_ids.some(id => id === n.old_id));
                    for (let n of newNodes) {
                        n.pos = DEFAULT_POSITION;
                        await backend.updateNode(n);
                    }
                    await backend.updateExternalBookmarks(newNodes);
                });

        case "MOVE_NODES":
            return backend.moveNodes(message.node_ids, message.dest_id);

        case "DELETE_NODES":
            return backend.deleteNodes(message.node_ids);

        case "REORDER_NODES":
            return backend.reorderNodes(message.positions);

        case "BROWSE_NODE":
            browseNode(message.node, message.tab, message.preserveHistory, message.container);
            break;

        case "BROWSE_NOTES":
            (message.tab
                ? browser.tabs.update(message.tab.id, {
                    "url": "notes.html#" + message.uuid + ":" + message.id,
                    "loadReplace": true
                })
                : browser.tabs.create({"url": "notes.html#" + message.uuid + ":" + message.id}));
            break;

        case "BROWSE_ORG_REFERENCE":
            location.href = message.link;
            break;

        case "IMPORT_FILE":
            shelf = isSpecialShelf(message.file_name) ? message.file_name.toLocaleLowerCase() : message.file_name;

            let importf = ({
                "JSONL": async () => importJSON(shelf, new ReadLine(message.file)),
                "JSON": async () => importJSON(shelf, new ReadLine(message.file)),
                "ORG": async () => importOrg(shelf, await readFile(message.file)),
                "HTML": async () => importHtml(shelf, await readFile(message.file)),
                "RDF": async () => importRDF(shelf, message.file, message.threads, message.quick)
            })
                [message.file_ext.toUpperCase()];

            let invalidation_state = ishellBackend.isInvalidationEnabled();
            ishellBackend.enableInvalidation(false);
            return backend.importTransaction(importf).finally(() => {
                ishellBackend.enableInvalidation(invalidation_state);
                ishellBackend.invalidateCompletion();
            });

        case "EXPORT_FILE":
            shelf = isSpecialShelf(message.shelf) ? message.shelf.toLocaleLowerCase() : message.shelf;

            let format = settings.export_format() ? settings.export_format() : "json";

            let shallowExport = false;
            if (format === "org_shallow") {
                shallowExport = true;
                format = "org";
            }

            let exportf = format === "json" ? exportJSON : exportOrg;
            let file_name = shelf.replace(/[\\\/:*?"<>|\[\]()^#%&!@:+={}'~]/g, "_")
                          + `.${format == "json" ? "jsonl" : format}`;

            let nodesRandom = await backend.getNodes(message.nodes.map(n => n.id));
            const nodes = [];

            for (const n of message.nodes) {
                const node = nodesRandom.find(nr => nr.id === n.id);
                Object.assign(node, n);
                nodes.push(node);
            }

            nodesRandom = null;

            if (settings.use_helper_app_for_export() && await nativeBackend.probe()) {
                // write to a temp file (much faster than IDB)

                try {
                    nativeBackend.fetch("/export/initialize");
                } catch (e) {
                    console.log(e);
                }

                const port = await nativeBackend.getPort();

                const file = {
                    append: async function (text) {
                        await port.postMessage({
                            type: "EXPORT_PUSH_TEXT",
                            text: text
                        })
                    }
                };

                await exportf(file, nodes, message.shelf, message.uuid, shallowExport);

                port.postMessage({
                    type: "EXPORT_FINISH"
                });

                let url = nativeBackend.url("/export/download");
                let download;

                try {
                    download = await browser.downloads.download({url: url, filename: file_name, saveAs: true});
                } catch (e) {
                    console.error(e);
                    nativeBackend.fetch("/export/finalize");
                }

                if (download) {
                    let download_listener = delta => {
                        if (delta.id === download) {
                            if (delta.state && delta.state.current === "complete" || delta.error) {
                                browser.downloads.onChanged.removeListener(download_listener);
                                nativeBackend.fetch("/export/finalize");
                            }
                        }
                    };
                    browser.downloads.onChanged.addListener(download_listener);
                }
            }
            else {
                // store intermediate export results to IDB

                const MAX_BLOB_SIZE = 1024 * 1024 * 20; // ~40 mb of UTF-16
                const processId = UUID.numeric();

                let file = {
                    content: [],
                    size: 0,
                    append: async function (text) {
                        this.content.push(text);
                        this.size += text.length;

                        if (this.size >= MAX_BLOB_SIZE) {
                            await backend.exportPutBlob(processId, new Blob(this.content, {type: "text/plain"}));
                            this.content = [];
                            this.size = 0;
                        }
                    },
                    flush: async function () {
                        if (this.size && this.content.length)
                            await backend.exportPutBlob(processId, new Blob(this.content, {type: "text/plain"}));
                    }
                };

                await exportf(file, nodes, message.shelf, message.uuid, shallowExport);
                await file.flush();

                let blob = new Blob(await backend.exportGetBlobs(processId), {type: "text/plain"});
                let url = URL.createObjectURL(blob);
                let download;

                try {
                    download = await browser.downloads.download({url: url, filename: file_name, saveAs: true});
                } catch (e) {
                    console.error(e);
                    backend.exportCleanBlobs(processId);
                }

                if (download) {
                    let download_listener = delta => {
                        if (delta.id === download) {
                            if (delta.state && delta.state.current === "complete" || delta.error) {
                                browser.downloads.onChanged.removeListener(download_listener);
                                URL.revokeObjectURL(url);
                                backend.exportCleanBlobs(processId);
                            }
                        }
                    };
                    browser.downloads.onChanged.addListener(download_listener);
                }
            }
            break;

        case "LIST_BACKUPS": {
            let form = new FormData();
            form.append("directory", message.directory);

            return nativeBackend.fetchJSON(`/backup/list`, {method: "POST", body: form});
        }

        case "BACKUP_SHELF": {
            const everything = message.shelf.toLowerCase() === EVERYTHING;
            let shelf, shelfName, shelfUUID;

            if (everything) {
                shelfUUID = shelfName = EVERYTHING;
            }
            else {
                shelf = await backend.queryShelf(message.shelf);
                shelfUUID = shelf.uuid;
                shelfName = shelf.name;
            }

            let nodes;

            if (everything) {
                const shelves = await backend.queryShelf();
                const cloud = shelves.find(s => s.id === CLOUD_SHELF_ID);
                if (cloud)
                    shelves.splice(shelves.indexOf(cloud), 1);
                nodes = await backend.queryFullSubtree(shelves.map(s => s.id), false, true);
            }
            else {
                nodes = await backend.queryFullSubtree(shelf.id, false, true);
                nodes.shift();
            }

            let backupFile = `${UUID.date()}_${shelfUUID}.jsonl`

            try {
                let form = new FormData();
                form.append("directory", message.directory);
                form.append("file", backupFile);
                form.append("compress", message.compress);

                nativeBackend.fetch("/backup/initialize", {method: "POST", body: form});

                const port = await nativeBackend.getPort();

                const file = {
                    append: async function (text) {
                        await port.postMessage({
                            type: "BACKUP_PUSH_TEXT",
                            text: text
                        })
                    }
                };

                await exportJSON(file, nodes, shelfName, shelfUUID, false, message.comment, true);

                port.postMessage({
                    type: "BACKUP_FINISH"
                });
            } catch (e) {
                console.log(e);
            }
        }
        break;

        case "RESTORE_SHELF": {
            send.startProcessingIndication();

            try {
                let form = new FormData();
                form.append("directory", message.directory);
                form.append("file", message.meta.file);

                await nativeBackend.fetch("/restore/initialize", {method: "POST", body: form});

                const Reader = class {
                    async* lines() {
                        let line;
                        while (line = await nativeBackend.fetchText("/restore/get_line"))
                            yield line;
                    }
                };

                const shelfName = message.new_shelf? message.meta.alt_name: message.meta.name;
                const shelf = await importJSON(shelfName, new Reader(), true);

                await nativeBackend.fetch("/restore/finalize");

                send.nodesImported({shelf});

            } catch (e) {
                console.log(e);
            }

            send.stopProcessingIndication();

        }
        break;

        case "DELETE_BACKUP": {
            send.startProcessingIndication();

            try {
                let form = new FormData();
                form.append("directory", message.directory);
                form.append("file", message.meta.file);

                await nativeBackend.fetch("/backup/delete", {method: "POST", body: form});
            } catch (e) {
                console.log(e);
                return false;
            }

            send.stopProcessingIndication();
            return true;
        }

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
                browserBackend.reconcileBrowserBookmarksDB();
            });
            break;
        case "RECONCILE_CLOUD_BOOKMARK_DB":
            settings.load(s => {
                cloudBackend.reconcileCloudBookmarksDB(message.verbose);
            });
            break;

        case "ENABLE_CLOUD_BACKGROUND_SYNC":
            settings.load(s => {
                startCloudBackgroundSync(s);
            });
            break;

        case "HELPER_APP_HAS_VERSION": {
            const helperApp = await nativeBackend.probe();

            if (helperApp && nativeBackend.hasVersion(message.version))
                return true;
        }
        break;

        case "GET_ADDON_IDB_PATH": {
            let helperApp = await nativeBackend.probe();

            if (!helperApp)
                return;

            const addonId = browser.runtime.getURL("/").split("/")[2];

            return nativeBackend.fetchText(`/request/idb_path/${addonId}`)
        }

        case "RECALCULATE_ARCHIVE_SIZE": {
            const nodeIDs = await backend.getNodeIds();

            send.startProcessingIndication();

            for (let id of nodeIDs) {
                const node = await backend.getNode(id);

                if (node.type === NODE_TYPE_ARCHIVE) {
                    const blob = await backend.fetchBlob(node.id);

                    if (blob && blob.data) {
                        if (blob.byte_length)
                            node.size = blob.byte_length;
                        else
                            node.size = stringByteLengthUTF8(blob.data);

                        await backend.updateNode(node);
                    }
                    else if (blob && blob.object) {
                        node.size = blob.object.size;
                        await backend.updateNode(node);
                    }
                }
                else if (node.type === NODE_TYPE_NOTES && node.has_notes) {
                    const notes = await backend.fetchNotes(node.id);

                    if (notes) {
                        node.size = stringByteLengthUTF8(notes.content);
                        if (notes.format === "delta")
                            node.size += stringByteLengthUTF8(notes.html);
                    }

                    await backend.updateNode(node);
                }
            }

            settings.archve_size_repaired(true);

            send.stopProcessingIndication();
        }
            break;
        case "REINDEX_ARCHIVE_CONTENT": {
            const nodeIDs = await backend.getNodeIds();

            send.startProcessingIndication();

            for (let id of nodeIDs) {
                const node = await backend.getNode(id);

                //console.log("Processing: %s", node.name)

                try {
                    if (node.type === NODE_TYPE_ARCHIVE) {
                        const blob = await backend.fetchBlob(node.id);

                        if (blob && !blob.byte_length && blob.data && blob.data.indexWords)
                            await backend.updateIndex(node.id, blob.data.indexWords());
                        else if (blob && !blob.byte_length && blob.object) {
                            let text = await backend.reifyBlob(blob);
                            await backend.updateIndex(node.id, text?.indexWords());
                        }
                    }

                    if (node.has_notes) {
                        const notes = await backend.fetchNotes(node.id);
                        if (notes) {
                            delete notes.id;
                            await backend.storeNotesLowLevel(notes);
                        }
                    }

                    if (node.has_comments) {
                        const comments = await backend.fetchComments(node.id);
                        if (comments) {
                            const words = comments.indexWords(false);
                            await backend.updateCommentIndex(node.id, words);
                        }
                    }
                }
                catch (e) {
                    console.error(e);
                }
            }

            send.stopProcessingIndication();
        }
            break;
        case "RESET_CLOUD": {
            if (!cloudBackend.isAuthenticated())
                return false;

            send.startProcessingIndication();

            await cloudBackend.reset();

            send.stopProcessingIndication();

            return true;
        }
            break;
    }
});

function startCloudBackgroundSync(s) {
    if (s.cloud_background_sync())
        window._backgroundSyncInterval = setInterval(
            () => cloudBackend.reconcileCloudBookmarksDB(),
            15 * 60 * 1000);
    else
        if (window._backgroundSyncInterval)
            clearInterval(window._backgroundSyncInterval);
}

settings.load(async settings => {
    navigator.storage.persist().then(async function(persistent) {
        if (persistent) {
            await browserBackend.reconcileBrowserBookmarksDB();
            startCloudBackgroundSync(settings);
        } else
            console.log("Scrapyard was denied persistent storage permissions");
    });
});

search.initializeOmnibox();



console.log("==> background.js loaded");
