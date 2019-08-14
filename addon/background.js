import {isSpecialShelf, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES} from "./db.js";
import {backend, browserBackend} from "./backend.js";
import {exportOrg, exportJSON, importOrg, importJSON, importHtml, importRDF} from "./import.js";
import {settings} from "./settings.js";
import {readFile, showNotification, withIDBFile} from "./utils.js";

export function browseNode(node) {

    switch (node.type) {
        case NODE_TYPE_BOOKMARK:
            let url = node.uri;
            if (url) {
                if (url.indexOf("://") < 0)
                    url = "http://" + url;
            }

            return browser.tabs.create({"url": url});

        case NODE_TYPE_ARCHIVE:
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

                    return browser.tabs.create({
                        "url": archiveURL
                    }).then(tab => {
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
            return browser.tabs.create({
                "url": "notes.html#" + node.uuid + ":" + node.id
            });
    }
}


/* Internal message listener */

browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    let shelf;
    switch (message.type) {
        case "CREATE_BOOKMARK":
            backend.addBookmark(message.data, NODE_TYPE_BOOKMARK).then(bookmark => {
                browser.runtime.sendMessage({type: "BOOKMARK_CREATED", node: bookmark});
            });
            break;

        case "BROWSE_NODE":
            browseNode(message.node);
            break;

        case "BROWSE_NOTES":
            browser.tabs.create({
                "url": "notes.html#" + message.node.uuid + ":" + message.node.id
            });
            break;

        case "IMPORT_FILE":
            shelf = isSpecialShelf(message.file_name)? message.file_name.toLocaleLowerCase(): message.file_name;

            let importf = ({"JSON": () => importJSON(shelf, message.file),
                            "ORG":  async () => importOrg(shelf, await readFile(message.file)),
                            "HTML": async () => importHtml(shelf, await readFile(message.file)),
                            "RDF": () => importRDF(shelf, message.file, message.threads)})
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
    }
});

settings.load(s => {
    backend.reconcileBrowserBookmarksDB();
});

console.log("==> background.js loaded");
