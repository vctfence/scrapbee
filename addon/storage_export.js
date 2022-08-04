import {EntityIDB} from "./storage_idb.js";
import {CLOUD_SHELF_ID, DEFAULT_SHELF_ID, BROWSER_SHELF_ID} from "./storage.js";
import {Query} from "./storage_query.js";

class ExportAreaIDB extends EntityIDB {
    addBlob(exportId, blob) {
        return this._db.export_storage.add({
            process_id: exportId,
            blob
        });
    }

    async getBlobs(exportId) {
        const blobs = await this._db.export_storage.where("process_id").equals(exportId).sortBy("id")
        return blobs.map(b => b.blob);
    }

    removeBlobs(exportId) {
        return this._db.export_storage.where("process_id").equals(exportId).delete();
    }

    wipe() {
        return this._db.export_storage.clear();
    }

    async prepareToImportEverything() {
        const retain = [DEFAULT_SHELF_ID, BROWSER_SHELF_ID, CLOUD_SHELF_ID,
            ...(await Query.fullSubtreeOfIDs(BROWSER_SHELF_ID)),
            ...(await Query.fullSubtreeOfIDs(CLOUD_SHELF_ID))];

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

        return this._db.nodes.where("id").noneOf(retain).delete();
    }
}

export let ExportArea = new ExportAreaIDB();
