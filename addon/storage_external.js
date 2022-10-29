import {StorageAdapterDisk} from "./storage_adapter_disk.js";
import {settings} from "./settings.js";

class StorageDisk extends StorageAdapterDisk {
    wipeStorage() {
        if (!settings.storage_mode_internal())
            return this._postJSON("/storage/wipe", {});
    }

    openBatchSession() {
        if (!settings.storage_mode_internal())
            return this._postJSON("/storage/open_batch_session", {});
    }

    closeBatchSession() {
        if (!settings.storage_mode_internal())
            return this._postJSON("/storage/close_batch_session", {});
    }

    async deleteOrphanedItems(orphanedItems) {
        if (!settings.storage_mode_internal())
            return this._postJSON("/storage/delete_orphaned_items", {node_uuids: orphanedItems});
    }
}

export const DiskStorage = new StorageDisk();
