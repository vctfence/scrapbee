import {StorageAdapterDisk} from "./storage_adapter_disk.js";
import {StorageAdapterCloud} from "./storage_adapter_cloud.js";
import {BROWSER_EXTERNAL_TYPE, CLOUD_EXTERNAL_TYPE} from "./storage.js";

const STORAGE_ADAPTER_DISK = new StorageAdapterDisk();
const STORAGE_ADAPTER_CLOUD = new StorageAdapterCloud();

export class StorageProxy {
    static _adapterDisk = new StorageAdapterDisk();
    static _adapterCloud = new StorageAdapterCloud();

    static setCloudProvider(provider) {
        this._adapterCloud.setProvider(provider);
    }

    adapter(node) {
        if (Array.isArray(node)) {
            const distinctExternals = node
                .map(n => n.external)
                .filter((v, i, a) => a.indexOf(v) === i);

            if (distinctExternals.length > 1)
                throw new Error("Operation on nodes from shelves with heterogeneous storage.");

            node = node?.[0];
        }

        if (!node)
            return;

        if (node.external === CLOUD_EXTERNAL_TYPE)
            return StorageProxy._adapterCloud;
        else if (node.external !== BROWSER_EXTERNAL_TYPE)
            return StorageProxy._adapterDisk;
    }

}
