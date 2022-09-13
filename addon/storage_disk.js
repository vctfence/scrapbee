import {StorageAdapterDisk} from "./storage_adapter_disk.js";

class StorageDisk extends StorageAdapterDisk {
    wipeStorage() {
        return this._postJSON("/storage/wipe", {});
    }

    openBatchSession() {
        return this._postJSON("/storage/open_batch_session", {});
    }

    closeBatchSession() {
        return this._postJSON("/storage/close_batch_session", {});
    }
}

export const Disk = new StorageDisk();
