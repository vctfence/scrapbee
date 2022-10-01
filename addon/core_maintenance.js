import {receive, send, sendLocal} from "./proxy.js";
import {isContentNode, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES, DEFAULT_SHELF_UUID} from "./storage.js";
import {cloudShelf} from "./plugin_cloud_shelf.js";
import {Node} from "./storage_entities.js";
import {Database} from "./storage_database.js";
import {settings} from "./settings.js";
import {helperApp} from "./helper_app.js";
import {Export} from "./import.js";
import {UnmarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";
import {isDeepEqual} from "./utils.js";

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

    send.stopProcessingIndication();

    return sendLocal.performSync();
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
    const helper = await helperApp.probe(true);

    if (helper) {
        await settings.load();
        const params = {data_path: settings.data_folder_path()};
        return await helperApp.fetchJSON_postJSON("/storage/get_orphaned_items", params);
    }
};

receive.rebuildItemIndex = async message => {
    const helper = await helperApp.probe(true);

    if (helper) {
        await settings.load();
        const params = {data_path: settings.data_folder_path()};
        return await helperApp.postJSON("/storage/rebuild_item_index", params);
    }
};

receive.compareDatabaseStorage = async message => {
    const helper = await helperApp.probe(true);

    if (helper) {
        await settings.load();
        const params = {data_path: settings.data_folder_path()};
        const storedNodes = await helperApp.fetchJSON_postJSON("/storage/debug_get_stored_node_instances", params);
        const nodes = await Export.nodes("everything");
        const unmarshaller = new UnmarshallerJSONScrapbook();

        let result = Object.keys(storedNodes).length === nodes.length;

        if (!result)
            return result;

        for (const node of nodes) {
            if (node.uuid === DEFAULT_SHELF_UUID)
                continue;

            const storedObjects = storedNodes[node.uuid];

            if (storedObjects) {
                let dbItem = unmarshaller.unconvertNode(storedObjects.db_item);
                dbItem = unmarshaller.deserializeNode(dbItem);
                await unmarshaller.findParentInIDB(dbItem)

                let objectItem = unmarshaller.unconvertNode(storedObjects.object_item);
                objectItem = unmarshaller.deserializeNode(objectItem);
                await unmarshaller.findParentInIDB(objectItem)

                delete node.id;
                delete node.icon;
                delete node.tag_list;

                if (!isDeepEqual(node, dbItem) || !isDeepEqual(node, objectItem)) {
                    console.log("objects do not match");
                    console.log(node, dbItem, objectItem);
                    result = false;
                }
            }
            else {
                console.log("no corresponding object");
                console.log(node);
                result = false;
            }

            if (!result)
                break;
        }

        return result;
    }
};
