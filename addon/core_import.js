import {isBuiltInShelf} from "./storage.js";
import {LineStream, LineReader, readFile} from "./utils_io.js";
import {ishellBackend} from "./backend_ishell.js";
import {settings} from "./settings.js";
import {nativeBackend} from "./backend_native.js";
import {receive} from "./proxy.js";
import UUID from "./lib/uuid.js";
import {sleep} from "./utils.js";
import {Import, Export} from "./import.js";
import {ExportArea} from "./storage_export.js";

receive.importFile = async message => {
    const shelf = isBuiltInShelf(message.file_name)? message.file_name.toLocaleLowerCase(): message.file_name;
    const format = message.file_ext.toLowerCase();
    const importerBuilder = Import.create(format);

    if (importerBuilder) {
        importerBuilder.setName(shelf)
        importerBuilder.setReportProgress(true);

        switch (format) {
            case "json":
            case "jsonl":
                importerBuilder.setStream(new LineStream(new LineReader(message.file)));
                break;
            case "org":
            case "html":
                importerBuilder.setStream(await readFile(message.file));
                break;
            case "rdf":
                importerBuilder.setStream(message.file);
                importerBuilder.setNumberOfThreads(message.threads);
                importerBuilder.setQuickImport(message.quick);
                break;
        }

        const importer = importerBuilder.build();

        let invalidationState = ishellBackend.isInvalidationEnabled();
        ishellBackend.enableInvalidation(false);
        return Import.transaction(shelf, importer).finally(() => {
            ishellBackend.enableInvalidation(invalidationState);
            ishellBackend.invalidateCompletion();
        });
    }
};

receive.exportFile = async message => {
    const shelf = isBuiltInShelf(message.shelf)? message.shelf.toLocaleLowerCase(): message.shelf;

    let format = settings.export_format() || "json";

    let shallowExport = false;
    if (format === "org_shallow") {
        shallowExport = true;
        format = "org";
    }

    let nodes = await Export.nodes(shelf, format === "org");

    const exportBuilder = Export.create(format)
        .setName(message.shelf)
        .setUUID(message.uuid)
        .setLinksOnly(shallowExport)
        .setReportProgress(true)
        .setObjects(nodes);

    const file_ext = `.${format === "json" ? "jsonl" : format}`;
    const file_name = shelf.replace(/[\\\/:*?"<>|^#%&!@:+={}'~]/g, "_") + file_ext;

    if (settings.use_helper_app_for_export() && await nativeBackend.probe())
        await exportWithHelperApp(exportBuilder, file_name);
    else
        await exportStandalone(exportBuilder, file_name);
};

async function exportStandalone(exportBuilder, file_name) {
    const MAX_BLOB_SIZE = 1024 * 1024 * 10; // ~20 mb of UTF-16
    const exportId = UUID.numeric();

    let file = {
        content: [],
        size: 0,
        append: async function (text) { // store intermediate export results to IDB
            this.content.push(text);
            this.size += text.length;

            if (this.size >= MAX_BLOB_SIZE) {
                await ExportArea.addBlob(exportId, new Blob(this.content, {type: "text/plain"}));
                this.content = [];
                this.size = 0;
            }
        },
        flush: async function () {
            if (this.size && this.content.length)
                await ExportArea.addBlob(exportId, new Blob(this.content, {type: "text/plain"}));
        }
    };

    await ExportArea.wipe();
    exportBuilder.setStream(file);
    const exporter = exportBuilder.build();
    await exporter.export();
    await file.flush();

    let blob = new Blob(await ExportArea.getBlobs(exportId), {type: "text/plain"});
    let url = URL.createObjectURL(blob);
    let download;

    try {
        download = await browser.downloads.download({url: url, filename: file_name, saveAs: true});
    } catch (e) {
        console.error(e);
        ExportArea.removeBlobs(exportId);
    }

    if (download) {
        let download_listener = delta => {
            if (delta.id === download) {
                if (delta.state && delta.state.current === "complete" || delta.error) {
                    browser.downloads.onChanged.removeListener(download_listener);
                    URL.revokeObjectURL(url);
                    ExportArea.removeBlobs(exportId);
                }
            }
        };
        browser.downloads.onChanged.addListener(download_listener);
    }
}

async function exportWithHelperApp(exportBuilder, file_name) {
    try {
        nativeBackend.fetch("/export/initialize");
    } catch (e) {
        console.error(e);
    }

    const port = await nativeBackend.getPort();

    const file = {
        append: async function (text) { // write to a temp file (much faster than IDB)
            port.postMessage({
                type: "EXPORT_PUSH_TEXT",
                text: text
            })
        }
    };

    await sleep(50);

    exportBuilder.setStream(file);
    const exporter = exportBuilder.build();
    await exporter.export();

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
