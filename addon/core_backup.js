import {send} from "./proxy.js";
import {nativeBackend} from "./backend_native.js";
import {
    CLOUD_SHELF_ID,
    DONE_SHELF_NAME,
    EVERYTHING,
    FIREFOX_BOOKMARK_MOBILE,
    TODO_SHELF_NAME
} from "./storage.js";
import {backend} from "./backend.js";
import {receive} from "./proxy.js"
import UUID from "./lib/uuid.js";
import {exportJSON, importJSON} from "./import_json.js";
import {sleep} from "./utils.js";
import {importTransaction} from "./import.js";

receive.listBackups = message => {
    let form = new FormData();
    form.append("directory", message.directory);

    return nativeBackend.fetchJSON(`/backup/list`, {method: "POST", body: form});
};

receive.backupShelf = async message => {
    const ushelf = message.shelf.toUpperCase();
    let shelf, shelfName, shelfUUID;

    if (ushelf === TODO_SHELF_NAME || ushelf === DONE_SHELF_NAME || ushelf === EVERYTHING.toUpperCase()) {
        shelf = shelfUUID = shelfName = message.shelf;
    }
    else {
        shelf = await backend.queryShelf(message.shelf);
        shelfUUID = shelf.uuid;
        shelfName = shelf.name;
    }

    let nodes = await backend.listExportedNodes(shelf);

    let backupFile = `${UUID.date()}_${shelfUUID}.jsonl`

    const process = nativeBackend.post("/backup/initialize", {
        directory: message.directory,
        file: backupFile,
        compress: message.compress,
        method: message.method,
        level: message.level
    });

    const port = await nativeBackend.getPort();

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
        await exportJSON(file, nodes, shelfName, shelfUUID, false, message.comment, true);
    }
    finally {
        port.postMessage({
            type: "BACKUP_FINISH"
        });
    }

    await process;
};

receive.restoreShelf = async message => {
    send.startProcessingIndication({no_wait: true});

    let error;
    let shelf;

    try {
        await nativeBackend.post("/restore/initialize", {
            directory: message.directory,
            file: message.meta.file
        });

        const Reader = class {
            async* lines() {
                while (true) {
                    const response = await nativeBackend.fetch("/restore/get_line");
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
        shelf = await importTransaction(shelfName, () => importJSON(shelfName, new Reader(), true));
    } catch (e) {
        error = e;
    }
    finally {
        await nativeBackend.fetch("/restore/finalize");
        send.stopProcessingIndication();
        send.nodesImported({shelf});
    }

    if (error)
        throw error;
};

receive.deleteBackup = async message => {
    send.startProcessingIndication({no_wait: true});

    try {
        await nativeBackend.post("/backup/delete", {
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
