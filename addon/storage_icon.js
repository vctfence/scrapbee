import {EntityIDB} from "./storage_idb.js";
import {Node} from "./storage_entities.js";

export class IconIDB extends EntityIDB {
    static newInstance() {
        const instance = new IconIDB();
        instance.import = new IconIDB();
        instance.import._importer = true;
        return instance;
    }

    async add(nodeId, dataUrl) {
        const exists = nodeId? await this._db.icons.where("node_id").equals(nodeId).count(): false;

        let iconId;

        if (exists) {
            await this._db.icons.where("node_id").equals(nodeId).modify({
                data_url: dataUrl
            });
        }
        else {
            iconId = await this._db.icons.add({
                node_id: nodeId,
                data_url: dataUrl
            });
        }

        if (nodeId && !this._importer)
            await Node.contentUpdate({id: nodeId}); // new content_modified

        return iconId;
    }

    async update(iconId, options) {
        await this._db.icons.update(iconId, options);
    }

    async get(nodeId) {
        const icon = await this._db.icons.where("node_id").equals(nodeId).first();

        if (icon)
            return icon.data_url;

        return null;
    }
}

