import {send, receive} from "./proxy.js";
import {
    isContentNode,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_NOTES
} from "./storage.js";
import {cloudShelf} from "./plugin_cloud_shelf.js";
import {Node} from "./storage_entities.js";
import {Database} from "./storage_database.js";
import {settings} from "./settings.js";
import {helperApp} from "./helper_app.js";

receive.resetCloud = async message => {
    if (!cloudShelf.isAuthenticated())
        return false;

    send.startProcessingIndication({noWait: true});

    await cloudShelf.reset();

    send.stopProcessingIndication();

    return true;
}

receive.resetScrapyard = async message => {
    send.startProcessingIndication({noWait: true});

    await Database.wipeEverything();
    await settings.last_sync_date(null);

    browser.runtime.reload();

    send.stopProcessingIndication();

    send.shelvesChanged({synchronize: false});
}

receive.computeStatistics = async message => {
    let items = 0;
    let bookmarks = 0;
    let archives = 0;
    let notes = 0
    let size = 0;

    send.startProcessingIndication();

    await Node.iterate(node => {
        if (isContentNode(node))
            items += 1;

        if (node.type === NODE_TYPE_BOOKMARK)
            bookmarks += 1;

        if (node.type === NODE_TYPE_ARCHIVE) {
            archives += 1;
            size += node.size || 0;
        }

        if (node.type === NODE_TYPE_NOTES) {
            notes += 1;
            size += node.size || 0;
        }
    });

    send.stopProcessingIndication();

    return {items, bookmarks, archives, notes, size};
}

receive.getOrphanedItems = async message => {
    const helper = helperApp.probe(true);

    if (helper) {
        await settings.load();
        const params = {data_path: settings.data_folder_path()};
        return await helperApp.fetchJSON_postJSON("/storage/get_orphaned_items", params);
    }
};
