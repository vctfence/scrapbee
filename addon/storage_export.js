import {EntityIDB} from "./storage_idb.js";

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
}

export let ExportArea = new ExportAreaIDB();
