import {EntityIDB} from "./storage_idb.js";
import {indexHTML} from "./utils_html.js";
import {readBlob} from "./utils_io.js";
import {Node} from "./storage_entities.js";
import {delegateProxy} from "./proxy.js";
import {StorageAdapterDisk} from "./storage_adapter_disk.js";
import {ArchiveProxy} from "./storage_archive_proxy.js";

export class ArchiveIDB extends EntityIDB {
    static newInstance() {
        const instance = new ArchiveIDB();

        instance.import = delegateProxy(new ArchiveProxy(new StorageAdapterDisk()), new ArchiveIDB());
        instance.import._importer = true;

        instance.idb = {import: new ArchiveIDB()};
        instance.idb.import._importer = true;

        return delegateProxy(new ArchiveProxy(new StorageAdapterDisk()), instance);
    }

    entity(node, data, contentType, byteLength) {
        contentType = contentType || "text/html";

        if (typeof data !== "string" && data?.byteLength) // from ArrayBuffer
            byteLength = data.byteLength;
        else if (typeof data === "string" && byteLength) // from binary string (presumably may come only form import)
            data = this._binaryString2Array(data);

        const object = data instanceof Blob? data: new Blob([data], {type: contentType});
        const result = {
            object,
            byte_length: byteLength, // presence of this field indicates that the object is binary
            type: contentType
        };

        if (node)
            result.node_id = node.id;

        return result;
    }

    indexEntity(node, words) {
        return {
            node_id: node.id,
            words: words
        };
    }

    async storeIndex(node, words) {
        const exists = await this._db.index.where("node_id").equals(node.id).count();
        const entity = this.indexEntity(node, words);

        if (exists)
            return this._db.index.where("node_id").equals(node.id).modify(entity);
        else
            return this._db.index.add(entity);
    }

    async fetchIndex(node) {
        return this._db.index.where("node_id").equals(node.id).first();
    }

    async _add(node, data, contentType, byteLength) {
        let entity = this.entity(node, data, contentType, byteLength);

        const exists = await this._db.blobs.where("node_id").equals(node.id).count();
        if (exists)
            await this._db.blobs.where("node_id").equals(node.id).modify(entity);
        else
            await this._db.blobs.add(entity);

        return entity;
    }

    async add(node, data, contentType, byteLength, index) {
        const entity = await this._add(node, data, contentType, byteLength);
        await this.updateContentModified(node, entity);

        if (index?.words)
            await this.storeIndex(node, index.words);
        else if (typeof data === "string" && !byteLength)
            await this.storeIndex(node, indexHTML(data));
    }

    async updateContentModified(node, entity) {
        if (!this._importer) {
            node.size = entity.object.size;
            node.content_type = entity.type;
            await Node.updateContentModified(node);
        }
    }

    async updateHTML(node, data) {
        const entity = await this._add(node, data);

        await this.storeIndex(node, indexHTML(data));

        return this.updateContentModified(node, entity);
    }

    async get(node) {
        return this._db.blobs.where("node_id").equals(node.id).first();
    }

    async delete(node) {
        if (this._db.tables.some(t => t.name === "blobs"))
            await this._db.blobs.where("node_id").equals(node.id).delete();

        if (this._db.tables.some(t => t.name === "index"))
            await this._db.index.where("node_id").equals(node.id).delete();
    }

    _binaryString2Array(bs) {
        let byteArray = new Uint8Array(bs.length);

        for (let i = 0; i < bs.length; ++i)
            byteArray[i] = bs.charCodeAt(i);

        return byteArray;
    }

    async reify(archive, binarystring = false) {
        let result;

        if (!archive)
            return null;

        if (archive.byte_length) {
            if (archive.data) { // archive.data contains textual representation, may present in legacy databases
                if (binarystring)
                    result = archive.data;
                else
                    result = this._binaryString2Array(archive.data);
            }
            else if (archive.object instanceof Blob) {
                if (binarystring)
                    result = await readBlob(archive.object, "binarystring");
                else
                    result = await readBlob(archive.object, "binary")
            }
            else if (typeof archive.object === "string") {
                if (binarystring)
                    result = archive.object;
                else
                    result = this._binaryString2Array(archive.object);
            }
        }
        else {
            if (archive.data)
                result = archive.data;
            else if (archive.object instanceof Blob)
                result = await readBlob(archive.object, "text");
            else
                result = archive.object;
        }

        return result;
    }
}

