import {isSpecialShelf} from "./storage.js";
import {readFile, ReadLine} from "./utils_io.js";
import {ishellBackend} from "./backend_ishell.js";
import {bookmarkManager} from "./backend.js";
import {settings} from "./settings.js";
import {nativeBackend} from "./backend_native.js";
import {receive} from "./proxy.js";
import UUID from "./lib/uuid.js";
import {exportOrg, importOrg} from "./import_org.js";
import {exportJSON, importJSON} from "./import_json.js";
import {importHtml} from "./import_html.js";
import {importRDF} from "./import_rdf.js";
import {sleep} from "./utils.js";
import {importTransaction} from "./import.js";

receive.importFile = message => {
    const shelf = isSpecialShelf(message.file_name) ? message.file_name.toLocaleLowerCase() : message.file_name;

    let importf = ({
        "JSONL": async () => importJSON(shelf, new ReadLine(message.file)),
        "JSON": async () => importJSON(shelf, new ReadLine(message.file)),
        "ORG": async () => importOrg(shelf, await readFile(message.file)),
        "HTML": async () => importHtml(shelf, await readFile(message.file)),
        "RDF": async () => importRDF(shelf, message.file, message.threads, message.quick)
    })[message.file_ext.toUpperCase()];

    if (importf) {
        let invalidation_state = ishellBackend.isInvalidationEnabled();
        ishellBackend.enableInvalidation(false);
        return importTransaction(shelf, importf).finally(() => {
            ishellBackend.enableInvalidation(invalidation_state);
            ishellBackend.invalidateCompletion();
        });
    }
};

receive.exportFile = async message => {
    const shelf = isSpecialShelf(message.shelf) ? message.shelf.toLocaleLowerCase() : message.shelf;

    let format = settings.export_format()? settings.export_format(): "json";

    let shallowExport = false;
    if (format === "org_shallow") {
        shallowExport = true;
        format = "org";
    }

    const exportf = format === "json"? exportJSON: exportOrg;
    const file_ext = `.${format === "json" ? "jsonl" : format}`;
    const file_name = shelf.replace(/[\\\/:*?"<>|^#%&!@:+={}'~]/g, "_") + file_ext;

    let nodes = await bookmarkManager.listExportedNodes(shelf, format === "org");

    if (settings.use_helper_app_for_export() && await nativeBackend.probe()) {
        // write to a temp file (much faster than IDB)

        try {
            nativeBackend.fetch("/export/initialize");
        } catch (e) {
            console.error(e);
        }

        const port = await nativeBackend.getPort();

        const file = {
            append: async function (text) {
                port.postMessage({
                    type: "EXPORT_PUSH_TEXT",
                    text: text
                })
            }
        };

        await sleep(50);

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

        const MAX_BLOB_SIZE = 1024 * 1024 * 10; // ~20 mb of UTF-16
        const processId = UUID.numeric();

        let file = {
            content: [],
            size: 0,
            append: async function (text) {
                this.content.push(text);
                this.size += text.length;

                if (this.size >= MAX_BLOB_SIZE) {
                    await bookmarkManager.putExportBlob(processId, new Blob(this.content, {type: "text/plain"}));
                    this.content = [];
                    this.size = 0;
                }
            },
            flush: async function () {
                if (this.size && this.content.length)
                    await bookmarkManager.putExportBlob(processId, new Blob(this.content, {type: "text/plain"}));
            }
        };

        await bookmarkManager.cleanExportStorage();
        await exportf(file, nodes, message.shelf, message.uuid, shallowExport);
        await file.flush();

        let blob = new Blob(await bookmarkManager.getExportBlobs(processId), {type: "text/plain"});
        let url = URL.createObjectURL(blob);
        let download;

        try {
            download = await browser.downloads.download({url: url, filename: file_name, saveAs: true});
        } catch (e) {
            console.error(e);
            bookmarkManager.cleanExportBlobs(processId);
        }

        if (download) {
            let download_listener = delta => {
                if (delta.id === download) {
                    if (delta.state && delta.state.current === "complete" || delta.error) {
                        browser.downloads.onChanged.removeListener(download_listener);
                        URL.revokeObjectURL(url);
                        bookmarkManager.cleanExportBlobs(processId);
                    }
                }
            };
            browser.downloads.onChanged.addListener(download_listener);
        }
    }
};
