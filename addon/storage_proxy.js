import {CLOUD_EXTERNAL_TYPE, FILES_EXTERNAL_TYPE, RDF_EXTERNAL_TYPE} from "./storage.js";
import {StorageAdapterDisk} from "./storage_adapter_disk.js";
import {StorageAdapterCloud} from "./storage_adapter_cloud.js";
import {StorageAdapterFiles} from "./storage_adapter_files.js";
import {StorageAdapterRDF} from "./storage_adapter_rdf.js";
import {settings} from "./settings.js";
import {nullDelegatingProxy} from "./proxy.js";


export class StorageProxy {
    static _adapterDisk = new StorageAdapterDisk();
    static _adapterCloud = new StorageAdapterCloud();
    static _adapterRDF = nullDelegatingProxy(new StorageAdapterRDF());
    static _adapterFiles = nullDelegatingProxy(new StorageAdapterFiles());

    static setCloudProvider(provider) {
        this._adapterCloud.setProvider(provider);
    }

    static get cloudAdapter() {
        return this._adapterCloud;
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
        else if (node.external === RDF_EXTERNAL_TYPE)
            return StorageProxy._adapterRDF;
        else if (node.external === FILES_EXTERNAL_TYPE)
            return StorageProxy._adapterFiles;
        else if (!node.external) {
            if (settings.storage_mode_internal())
                return null;
            else
                return StorageProxy._adapterDisk;
        }
    }

}
