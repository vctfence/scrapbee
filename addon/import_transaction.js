import {Query} from "./storage_query.js";
import {Node} from "./storage_entities.js";
import {
    CLOUD_SHELF_UUID,
    DEFAULT_SHELF_NAME,
    DEFAULT_SHELF_UUID,
    EVERYTHING,
    BROWSER_SHELF_UUID,
    NODE_TYPE_UNLISTED
} from "./storage.js";
import {settings} from "./settings.js";
import {send} from "./proxy.js";

const RESERVED_SHELVES = [CLOUD_SHELF_UUID, BROWSER_SHELF_UUID, DEFAULT_SHELF_UUID];

async function createRollbackNode(shelf) {
    let rollbackNode = {
        name: "_" + shelf,
        type: NODE_TYPE_UNLISTED
    };

    return Node.add(rollbackNode);
}

async function relocateNodes(nodes, dest) {
    for (let node of nodes) {
        await Node.update({id: node.id, parent_id: dest?.id || undefined}, false);
    }
}

async function maskUUIDs(rollbackNode) {
    const rollbackItemIds = await Query.fullSubtreeOfIDs(rollbackNode.id);

    await Node.batchUpdate(node => {
        node._unlisted = true;
        node._uuid = node.uuid;
        node.uuid = undefined;
    }, rollbackItemIds)
}

async function unmaskUUIDs(rollbackNode) {
    const rollbackItemIds = await Query.fullSubtreeOfIDs(rollbackNode.id);

    await Node.batchUpdate(node => {
        node._unlisted = undefined;
        node.uuid = node._uuid;
        node._uuid = undefined;
    }, rollbackItemIds)
}

export async function createRollback(shelf) {
    if (shelf === EVERYTHING) {
        const rollbackNode = await createRollbackNode(EVERYTHING);
        let shelves = await Query.allShelves();
        shelves = shelves.filter(n => !RESERVED_SHELVES.some(uuid => uuid === n.uuid));
        await relocateNodes(shelves, rollbackNode);
        await maskUUIDs(rollbackNode);

        await createRollback(DEFAULT_SHELF_NAME);
    }
    else {
        shelf = await Query.shelf(shelf);
        if (shelf) {
            const rollbackNode = await createRollbackNode(shelf.name);
            const nodes = await Node.getChildren(shelf.id);
            await relocateNodes(nodes, rollbackNode);
            await maskUUIDs(rollbackNode);
        }
    }
}

async function cleanRollback() {
    const unlisted = await Query.unlisted();
    let rollbackItems = [];

    for (const node of unlisted) {
        rollbackItems = [...await Query.fullSubtreeOfIDs(node.id), ...rollbackItems];
    }

    await Node.delete(rollbackItems);
}

async function undoFailedImport(shelf, exists) {
    if (shelf === EVERYTHING) {
        let shelves = await Query.allShelves();
        shelves = shelves.filter(n => !RESERVED_SHELVES.some(uuid => uuid === n.uuid));

        let failedItems = [];

        for (const node of shelves) {
            failedItems = [...await Query.fullSubtreeOfIDs(node.id), ...failedItems];
        }

        await Node.delete(failedItems);
    }
    else {
        shelf = await Query.shelf(shelf);

        if (shelf) {
            const failedItems = await Query.fullSubtreeOfIDs(shelf.id);
            if (exists)
                failedItems.shift();
            await Node.delete(failedItems);
        }
    }
}

async function rollbackImport(shelf, exists) {
    if (shelf === EVERYTHING) {
        await undoFailedImport(EVERYTHING, true);

        const rollbackNode = await Query.unlisted("_" + EVERYTHING);
        await unmaskUUIDs(rollbackNode);
        const shelves = await Node.getChildren(rollbackNode.id);
        await relocateNodes(shelves, null);

        await Node.delete(rollbackNode.id);

        await rollbackImport(DEFAULT_SHELF_NAME, true);
    }
    else {
        await undoFailedImport(shelf, exists);

        const rollbackNode = await Query.unlisted("_" + shelf);
        shelf = await Query.shelf(shelf);
        if (rollbackNode && shelf) {
            await unmaskUUIDs(rollbackNode);
            const nodes = await Node.getChildren(rollbackNode.id);
            await relocateNodes(nodes, shelf);
            await Node.delete(rollbackNode.id);
        }
    }
}

export async function importTransaction(shelf, importer) {
    const exists = shelf === EVERYTHING || !!await Query.shelf(shelf);
    const useTransaction = settings.undo_failed_imports();

    if (exists && useTransaction) {
        try {
            send.importInitializingTransaction();
        } catch {
        }

        await cleanRollback();
        await createRollback(shelf);
    }

    let result;
    try {
        result = await importer.import();
    } catch (e) {
        if (useTransaction) {
            try {
                send.importRollingBack();
            } catch {
            }

            await rollbackImport(shelf, exists);
        }
        throw e;
    }

    if (exists && useTransaction) {
        try {
            send.importFinalizingTransaction();
        } catch {
        }

        await cleanRollback(shelf);
    }

    return result;
}
