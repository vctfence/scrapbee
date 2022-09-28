import {receive, send} from "./proxy.js";
import {EVERYTHING_SHELF_NAME, NODE_TYPE_ARCHIVE} from "./storage.js";
import {Export} from "./import.js";
import {Node, Archive, Comments, Icon, Notes} from "./storage_entities.js";
import {showNotification} from "./utils_browser.js";
import {ProgressCounter} from "./utils.js";
import {settings} from "./settings.js";

receive.transferContentToDisk = async message => {

    if (!settings.data_folder_path()) {
        showNotification("Data folder path is not set.");
        return;
    }

    const nodes = await Export.nodes(EVERYTHING_SHELF_NAME);
    const progressCounter = new ProgressCounter(nodes.length, "exportProgress");

    try {
        send.startProcessingIndication({noWait: true});

        for (const node of nodes) {
            await transferNode(node);
            progressCounter.incrementAndNotify();
        }

        await settings.transition_to_disk(false);
        showNotification("Content transfer finished.");
        return true;
    } catch (e) {
        console.error(e);
        showNotification("Content transfer finished with errors.");
        return false;
    }
    finally {
        send.stopProcessingIndication();
        await progressCounter.finish();
    }
};

async function transferNode(node) {
    Node.put(node);
    await transferContent(node);
}

async function transferContent(node) {
    if (node.type === NODE_TYPE_ARCHIVE) {
        let archive = await Archive.idb.import.get(node);

        if (archive) {
            const index = await Archive.idb.import.fetchIndex(node);
            await Archive.add(node, archive, index);
        }
    }

    if (node.stored_icon) {
        let icon = await Icon.idb.import.get(node);
        if (icon)
            await Icon.add(node, icon);
    }

    if (node.has_notes) {
        let notes = await Notes.idb.import.get(node);
        if (notes)
            await Notes.add(node, notes);
    }

    if (node.has_comments) {
        let comments = await Comments.idb.import.get(node);
        if (comments)
            await Comments.add(node, comments);
    }
}
