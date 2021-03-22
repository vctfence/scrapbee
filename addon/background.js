import {backend} from "./backend.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud.js";
import {nativeBackend} from "./backend_native.js";
import {ishellBackend} from "./backend_ishell.js";
import {settings} from "./settings.js";

import {
    exportOrg,
    exportJSON,
    importOrg,
    importJSON,
    importHtml,
    importRDF
} from "./import.js";

import {isSpecialPage, notifySpecialPage, readFile, showNotification} from "./utils.js";

import {
    isSpecialShelf,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_NOTES,
    RDF_EXTERNAL_NAME
} from "./storage_constants.js";

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
                let helperApp = await nativeBackend.probe(true);

                if (!helperApp)
                    return;

                let url = `http://localhost:${settings.helper_port_number()}/rdf/browse/${node.uuid}/_#`
                    + `${node.uuid}:${node.id}:${node.external_id}`

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
                            objectURL = `http://localhost:${settings.helper_port_number()}/browse/${node.uuid}`
                    }

                    if (!objectURL) {
                        if (blob.byte_length) {
                            blob.data = backend.blob2Array(blob);
                        }

                        let object = new Blob([blob.data], {type: blob.type? blob.type: "text/html"});
                        objectURL = URL.createObjectURL(object);
                    }

                    let archiveURL = objectURL + "#" + node.uuid + ":" + node.id;

                    return (external_tab
                                ? browser.tabs.update(external_tab.id, {"url": archiveURL, "loadReplace": !preserve_history})
                                : browser.tabs.create({"url": archiveURL}))
                            .then(tab => {
                                let listener = async (id, changed, tab) => {
                                    if (id === tab.id && changed.status === "complete") {
                                        browser.tabs.onUpdated.removeListener(listener);
                                        await browser.tabs.insertCSS(tab.id, {file: "edit.css"})
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

            let invalidation_state = ishellBackend.isInvalidationEnabled();
            ishellBackend.enableInvalidation(false);
            return backend.importTransaction(importf).finally(() => {
                    ishellBackend.enableInvalidation(invalidation_state);
                    ishellBackend.invalidateCompletion();
                });

        case "EXPORT_FILE":
            shelf = isSpecialShelf(message.shelf) ? message.shelf.toLocaleLowerCase() : message.shelf;

            let format = settings.export_format()? settings.export_format(): "json";
            let exportf = format === "json"? exportJSON: exportOrg;
            let file_name = shelf.replace(/[\\\/:*?"<>|\[\]()^#%&!@:+={}'~]/g, "_") + `.${format}`;

            const helperApp = await nativeBackend.probe();

            if (helperApp) {
                // write to temp file

                let init_url = `http://localhost:${settings.helper_port_number()}/export/initialize`
                let result = null;
                try {
                    result = fetch(init_url);
                }
                catch (e) {
                    console.log(e);
                }

                let port = await nativeBackend.getPort();

                let file = {
                    append: function (text) {
                        port.postMessage({
                            type: "EXPORT_PUSH_TEXT",
                            text: text
                        })
                    }
                };

                await exportf(file, message.nodes, message.shelf, message.uuid, settings.shallow_export(),
                    settings.compress_export());

                port.postMessage({
                    type: "EXPORT_FINISH"
                });

                let url = `http://localhost:${settings.helper_port_number()}/export/download`;

                let download = await browser.downloads.download({url: url, filename: file_name, saveAs: true});

                let download_listener = delta => {
                    if (delta.id === download && delta.state && delta.state.current === "complete") {
                        browser.downloads.onChanged.removeListener(download_listener);
                        fetch(`http://localhost:${settings.helper_port_number()}/export/finalize`);
                    }
                };
                browser.downloads.onChanged.addListener(download_listener);
            }
            else {
                // the entire exported file is stored in memory

                let file = {
                    content: [],
                    append: function (text) {
                        this.content.push(text);
                    }
                };

                await exportf(file, message.nodes, message.shelf, message.uuid, settings.shallow_export(),
                    settings.compress_export());

                let blob = new Blob(file.content, {type: "text/plain"});
                let url = URL.createObjectURL(blob);

                let download = await browser.downloads.download({url: url, filename: file_name, saveAs: true});

                let download_listener = delta => {
                    if (delta.id === download && delta.state && delta.state.current === "complete") {
                        browser.downloads.onChanged.removeListener(download_listener);
                        URL.revokeObjectURL(url);
                    }
                };
                browser.downloads.onChanged.addListener(download_listener);
            }

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
                browserBackend.reconcileBrowserBookmarksDB();
            });
            break;
        case "RECONCILE_CLOUD_BOOKMARK_DB":
            settings.load(s => {
                cloudBackend.reconcileCloudBookmarksDB();
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
            () => cloudBackend.reconcileCloudBookmarksDB(),
            15 * 60 * 1000);
    else
        if (window._backgroundSyncInterval)
            clearInterval(window._backgroundSyncInterval);
}

settings.load(async s => {
    navigator.storage.persist().then(async function(persistent) {
        if (persistent) {
            await browserBackend.reconcileBrowserBookmarksDB();
            startCloudBackgroundSync(s);
        } else
            console.log("Scrapyard was denied persistent storage permissions");
    })
});

console.log("==> background.js loaded");
