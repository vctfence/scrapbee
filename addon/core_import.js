import {isBuiltInShelf} from "./storage.js";
import {LineStream, LineReader, readFile} from "./utils_io.js";
import {ishellPlugin} from "./plugin_ishell.js";
import {settings} from "./settings.js";
import {receive} from "./proxy.js";
import {Import, Export} from "./import.js";
import {helperApp} from "./helper_app.js";
import {sleep} from "./utils.js";

receive.importFile = async message => {
    const shelf = isBuiltInShelf(message.file_name)? message.file_name.toLocaleLowerCase(): message.file_name;
    const format = message.file_ext.toLowerCase();
    const importerBuilder = Import.create(format);

    if (importerBuilder) {
        importerBuilder.setName(shelf)
        importerBuilder.setReportProgress(true);
        importerBuilder.setSidebarContext(!_BACKGROUND_PAGE);

        switch (format) {
            case "json":
            case "jsonl":
            case "jsbk":
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

        let invalidationState = ishellPlugin.isInvalidationEnabled();
        ishellPlugin.enableInvalidation(false);
        return Import.transaction(shelf, importer).finally(() => {
            ishellPlugin.enableInvalidation(invalidationState);
            ishellPlugin.invalidateCompletion();
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
        .setObjects(nodes)
        .setSidebarContext(!_BACKGROUND_PAGE);

    const fileExt = `.${format === "json" ? "jsbk" : format}`;
    const fileName = shelf.replace(/[\\\/:*?"<>|^#%&!@+={}'~]/g, "_") + fileExt;

    await exportWithHelperApp(exportBuilder, fileName, format);
};

async function exportWithHelperApp(exportBuilder, fileName, format) {
    try {
        helperApp.fetch("/export/initialize");
    } catch (e) {
        console.error(e);
    }

    const port = await helperApp.getPort();

    const file = {
        append: async function (text) {
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

    let url = helperApp.url("/export/download");
    let download;

    try {
        download = await browser.downloads.download({url: url, filename: fileName, saveAs: true});
    } catch (e) {
        console.error(e);
        helperApp.fetch("/export/finalize");
    }

    if (download) {
        let download_listener = delta => {
            if (delta.id === download) {
                if (delta.state && delta.state.current === "complete" || delta.error) {
                    browser.downloads.onChanged.removeListener(download_listener);
                    helperApp.fetch("/export/finalize");
                }
            }
        };
        browser.downloads.onChanged.addListener(download_listener);
    }
}
