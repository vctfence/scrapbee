import {EntityIDB} from "./storage_idb.js";
import {BROWSER_SHELF_ID, DEFAULT_SHELF_ID, CLOUD_SHELF_ID, RDF_EXTERNAL_TYPE, NODE_TYPE_SHELF} from "./storage.js";
import {Query} from "./storage_query.js";

class StorageDatabase extends EntityIDB {
    async #wipe(retain) {
        if (this._db.tables.some(t => t.name === "blobs"))
            await this._db.blobs.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "index"))
            await this._db.index.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "notes"))
            await this._db.notes.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "icons"))
            await this._db.icons.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "comments"))
            await this._db.comments.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "index_notes"))
            await this._db.index_notes.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "index_comments"))
            await this._db.index_comments.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "tags"))
            await this._db.tags.clear();

        if (this._db.tables.some(t => t.name === "metadata"))
            await this._db.metadata.clear();

        return this._db.nodes.where("id").noneOf(retain).delete();
    }

    async wipeEverything() {
        return this.#wipe([DEFAULT_SHELF_ID]);
    }

    async wipeImportable() {
        let retain = [DEFAULT_SHELF_ID, BROWSER_SHELF_ID, CLOUD_SHELF_ID,
            ...(await Query.fullSubtreeOfIDs(BROWSER_SHELF_ID)),
            ...(await Query.fullSubtreeOfIDs(CLOUD_SHELF_ID))];

        const shelves = await Query.allShelves();
        const openRDFShelves = shelves.filter(n => n.external === RDF_EXTERNAL_TYPE);
        for (const node of openRDFShelves)
            retain = [...retain, ...await Query.fullSubtreeOfIDs(node.id)]

        return this.#wipe(retain);
    }
}

export const Database = new StorageDatabase();
