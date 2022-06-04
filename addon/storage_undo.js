import {EntityIDB} from "./storage_idb.js";

export class UndoIDB extends EntityIDB {

    async add(undo) {
        undo.id = await this._db.undo.add(undo);
        return undo;
    }

    async get(id) {
        return this._db.undo.where("id").equals(id).first();
    }

    async peek() {
        const lastItem = await this._db.undo.orderBy("id").reverse().first();
        return lastItem || {stack: -1};
    }

    async pop() {
        const lastItem = await this._db.undo.orderBy("id").reverse().first();

        if (lastItem) {
            const stack = await this._db.undo.where("stack").equals(lastItem.stack).toArray();
            await this._db.undo.where("stack").equals(lastItem.stack).delete();
            return stack.sort((a, b) => a.id - b.id);
        }
    }
}

export const Undo = new UndoIDB();
