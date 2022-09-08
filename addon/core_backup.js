import {send} from "./proxy.js";
import {helperApp} from "./helper_app.js";
import {isVirtualShelf} from "./storage.js";
import {receive} from "./proxy.js"
import UUID from "./uuid.js";
import {sleep} from "./utils.js";
import {Export, Import} from "./import.js";
import {Query} from "./storage_query.js";
import {LineStream} from "./utils_io.js";

receive.listBackups = message => {
    let form = new FormData();
    form.append("directory", message.directory);

    return helperApp.fetchJSON(`/backup/list`, {method: "POST", body: form});
};

receive.backupShelf = async message => {
    let shelf, shelfName, shelfUUID;

    if (isVirtualShelf(message.shelf))
        shelf = shelfUUID = shelfName = message.shelf;
    else {
        shelf = await Query.shelf(message.shelf);
        shelfUUID = shelf.uuid;
        shelfName = shelf.name;
    }

    let nodes = await Export.nodes(shelf);

    let backupFile = `${UUID.date()}_${shelfUUID}.jsonl`

    const process = helperApp.post("/backup/initialize", {
        directory: message.directory,
        file: backupFile,
        compress: message.compress,
        method: message.method,
        level: message.level
    });

    const port = await helperApp.getPort();

    const file = {
        append: async function (text) {
            port.postMessage({
                type: "BACKUP_PUSH_TEXT",
                text: text
            })
        }
    };

    await sleep(50);

    try {
        const exporter = Export.create("json")
            .setName(shelfName)
            .setUUID(shelfUUID)
            .setComment(message.comment)
            .setReportProgress(true)
            .setMuteSidebar(true)
            .setObjects(nodes)
            .setStream(file)
            .build();

        await exporter.export();
    }
    finally {
        port.postMessage({
            type: "BACKUP_FINISH"
        });
    }

    await process;
};

receive.restoreShelf = async message => {
    send.startProcessingIndication({noWait: true});

    let error;
    let shelf;

    try {
        await helperApp.post("/restore/initialize", {
            directory: message.directory,
            file: message.meta.file
        });

        const Reader = class {
            async* lines() {
                while (true) {
                    const response = await helperApp.fetch("/restore/get_line");
                    if (response.ok) {
                        const line = await response.text();
                        if (line)
                            yield line;
                        else
                            break;
                    }
                    else
                        throw new Error("unknown error");
                }
            }
        };

        const shelfName = message.new_shelf? message.meta.alt_name: message.meta.name;
        const importer = Import.create("json")
            .setName(shelfName)
            .setReportProgress(true)
            .setMuteSidebar(true)
            .setStream(new LineStream(new Reader()))
            .build();

        shelf = await Import.transaction(shelfName, importer);
    } catch (e) {
        console.log(e.stack);
        error = e;
    }
    finally {
        await helperApp.fetch("/restore/finalize");
        send.stopProcessingIndication();
        send.nodesImported({shelf});
    }

    if (error)
        throw error;
};

receive.deleteBackup = async message => {
    send.startProcessingIndication({noWait: true});

    try {
        await helperApp.post("/backup/delete", {
            directory: message.directory,
            file: message.meta.file
        });
    } catch (e) {
        console.error(e);
        return false;
    }

    send.stopProcessingIndication();
    return true;
}
