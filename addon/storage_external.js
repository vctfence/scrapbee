import {StorageAdapterDisk} from "./storage_adapter_disk.js";
import {settings} from "./settings.js";
import {StorageProxy} from "./storage_proxy.js";
import {CLOUD_EXTERNAL_TYPE} from "./storage.js";
import {CONTEXT_BACKGROUND, getContextType} from "./utils_browser.js";
import {receive} from "./proxy.js";

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

    async isBatchSessionOpen() {
        if (!settings.storage_mode_internal()) {
            const response = await this._postJSON("/storage/is_batch_session_open", {});

            if (response.ok) {
                const json = await response.json();
                return json.result;
            }
        }
    }

    async deleteOrphanedItems(orphanedItems) {
        if (!settings.storage_mode_internal())
            return this._postJSON("/storage/delete_orphaned_items", {node_uuids: orphanedItems});
    }
}

export const DiskStorage = new StorageDisk();

class StorageCloud {
    async openBatchSession() {
        return StorageProxy.cloudAdapter.openBatchSession();
    }

    async closeBatchSession() {
        return StorageProxy.cloudAdapter.closeBatchSession();
    }
}

export const CloudStorage = new StorageCloud();

class StorageExternal {
    async openBatchSession(referenceNode) {
        await DiskStorage.openBatchSession();

        if (referenceNode.external === CLOUD_EXTERNAL_TYPE)
            await CloudStorage.openBatchSession();
    }

    async closeBatchSession(referenceNode) {
        await DiskStorage.closeBatchSession();

        if (referenceNode.external === CLOUD_EXTERNAL_TYPE)
            await CloudStorage.closeBatchSession();
    }

    async isBatchSessionOpen() {
        return DiskStorage.isBatchSessionOpen();
    }
}

export const ExternalStorage = new StorageExternal();

if (getContextType() === CONTEXT_BACKGROUND) {
    receive.openCloudBatchSession = message => {
        return CloudStorage.openBatchSession();
    };

    receive.closeCloudBatchSession = message => {
        return CloudStorage.closeBatchSession();
    };
}
