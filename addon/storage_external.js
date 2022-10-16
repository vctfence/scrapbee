import {StorageAdapterDisk} from "./storage_adapter_disk.js";

class StorageDisk extends StorageAdapterDisk {
    wipeStorage() {
        return this._postJSON("/storage/wipe", {});
    }

    cleanTempDirectory() {
        return this._postJSON("/storage/clean_temp_directory", {});
    }

    openBatchSession() {
        return this._postJSON("/storage/open_batch_session", {});
    }

    closeBatchSession() {
        return this._postJSON("/storage/close_batch_session", {});
    }

    async deleteOrphanedItems(orphanedItems) {
        return this._postJSON("/storage/delete_orphaned_items", {node_uuids: orphanedItems});
    }
}

export const DiskStorage = new StorageDisk();
