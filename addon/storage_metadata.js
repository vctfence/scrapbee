import {EntityIDB} from "./storage_idb.js";

export class MetadataIDB extends EntityIDB {

    async add(id, metadata) {
        const entity = {id, metadata};
        await this._db.metadata.put(entity);
    }

    async get(id) {
        const entity = await this._db.metadata.where("id").equals(id).first();
        return entity?.metadata;
    }
}

export const Metadata = new MetadataIDB();

Metadata.STORAGE = "storage";
