import {EntityIDB} from "./storage_idb.js";
import {Node} from "./storage_entities.js";
import {delegateProxy} from "./proxy.js";
import {IconProxy} from "./storage_icon_proxy.js";
import {StorageAdapterDisk} from "./storage_adapter_disk.js";
import {computeSHA1} from "./utils.js";

export class IconIDB extends EntityIDB {
    static newInstance() {
        const instance = new IconIDB();

        instance.import = delegateProxy(new IconProxy(new StorageAdapterDisk()), new IconIDB());
        instance.import._importer = true;

        instance.idb = {import: new IconIDB()};
        instance.idb.import._importer = true;

        return delegateProxy(new IconProxy(new StorageAdapterDisk()), instance);
    }

    async add(node, dataUrl) {
        const exists = node.id? await this._db.icons.where("node_id").equals(node.id).count(): false;
        const entity = this.entity(node, dataUrl);
        let iconId;

        if (exists)
            await this._db.icons.where("node_id").equals(node.id).modify(entity);
        else
            iconId = await this._db.icons.add(entity);

        if (node.id && !this._importer)
            await Node.updateContentModified(node); // new content_modified

        return iconId;
    }

    entity(node, dataUrl) {
        return {
            node_id: node.id,
            data_url: dataUrl
        };
    }

    persist(node, dataUrl) {
        // NOP, implemented in proxy
    }

    async update(iconId, options) {
        await this._db.icons.update(iconId, options);
    }

    async get(node) {
        const icon = await this._db.icons.where("node_id").equals(node.id).first();

        if (icon)
            return icon.data_url;

        return null;
    }

    async computeHash(iconUrl) {
        return "hash:" + (await computeSHA1(iconUrl));
    }
}

