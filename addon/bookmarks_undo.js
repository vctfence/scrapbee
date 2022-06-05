import {Undo} from "./storage_undo.js";
import {NODE_TYPE_SHELF, UNDO_DELETE} from "./storage.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Query} from "./storage_query.js";
import {Node} from "./storage_entities.js";

class _UndoManager {

    async canUndo() {
        return (await Undo.peek()).stack >= 0;
    }

    async undo() {
        const undoTop = await Undo.peek();

        if (undoTop.stack >= 0)
            switch (undoTop.operation) {
                case UNDO_DELETE:
                    return this.#undoDelete();
            }
    }

    async pushDeleted(ids, subtree) {
        const stackIndex = (await Undo.peek()).stack + 1;

        let ctr = 0;
        for (const node of subtree) {
            const undoItem = {
                stack: stackIndex,
                operation: UNDO_DELETE,
                node,
                selectedIDs: ctr++ === 0? ids: undefined // (!) currently not used
            };

            await Undo.add(undoItem);
        }
    }

    async #undoDelete() {
        const batch = await Undo.pop();
        const selectedIDs = batch[0].selectedIDs;

        let shelf;
        for (const undo of batch) {
            if (undo.node.type === NODE_TYPE_SHELF)
                shelf = undo.node;

            await Bookmark.restore(undo.node);
        }

        if (!shelf)
            shelf = await Query.rootOf(batch[0].node);

        return {operation: UNDO_DELETE, selectedIDs, shelf};
    }

    async commit() {
        let batch = await Undo.pop();

        while (batch) {
            switch (batch[0].operation) {
                case UNDO_DELETE:
                    await this.#commitDelete(batch);
                    break;
            }

            batch = await Undo.pop();
        }
    }

    async #commitDelete(batch) {
        const nodeIDs = batch.map(u => u.node.id);

        await Node.deleteDependencies(nodeIDs);
    }

}

export const UndoManager = new _UndoManager();
