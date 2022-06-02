import {EntityIDB} from "./storage_idb.js";
import {indexString, indexHTML} from "./utils_html.js";
import {readBlob} from "./utils_io.js";
import {Node} from "./storage_entities.js";

export class ArchiveIDB extends EntityIDB {
    static newInstance() {
        const instance = new ArchiveIDB();
        instance.import = new ArchiveIDB();
        instance.import._importer = true;
        return instance;
    }

    async _storeIndex(nodeId, words) {
        return this._db.index.add({
            node_id: nodeId,
            words: words
        });
    }

    async updateIndex(nodeId, words) {
        const exists = await this._db.index.where("node_id").equals(nodeId).count();

        if (exists)
            return this._db.index.where("node_id").equals(nodeId).modify({
                words: words
            });
        else
            return this._storeIndex(nodeId, words);
    }

    async fetchIndex(nodeId) {
        return this._db.index.where("node_id").equals(nodeId).first();
    }

    compose(data, contentType, byteLength) {
        if (typeof data !== "string" && data?.byteLength) // from ArrayBuffer
            byteLength = data.byteLength;
        else if (typeof data === "string" && byteLength) // from binary string (presumably may come only form import)
            data = this._binaryString2Array(data);

        let object = data instanceof Blob? data: new Blob([data], {type: contentType});

        return {
            object,
            data: undefined,
            byte_length: byteLength, // presence of this field indicates that the the object is binary
            type: contentType || "text/html"
        };
    }

    async _addRaw(nodeId, data, contentType, byteLength) {
        let options = this.compose(data, contentType, byteLength);
        options.node_id = nodeId;

        const exists = await this._db.blobs.where("node_id").equals(nodeId).count();
        if (exists)
            await this._db.blobs.where("node_id").equals(nodeId).modify(options);
        else
            await this._db.blobs.add(options);

        if (!this._importer) {
            const node = {id: nodeId, size: options.object.size, content_type: options.type};
            await Node.contentUpdate(node);
        }
    }

    async add(nodeId, data, contentType, byteLength, index) {
        await this._addRaw(nodeId, data, contentType, byteLength);

        if (index?.words)
            await this._storeIndex(nodeId, index.words);
        else if (typeof data === "string" && !byteLength)
            await this.updateIndex(nodeId, indexHTML(data));
    }

    async updateHTML(nodeId, data) {
        const object = new Blob([data], {type: "text/html"});

        await this._db.blobs.where("node_id").equals(nodeId).modify({
            object,
            data: undefined // undefined removes fields from IDB
        });

        await this.updateIndex(nodeId, indexHTML(data));

        if (!this._importer) {
            const node = {id: nodeId, size: object.size};
            await Node.contentUpdate(node);
        }
    }

    async get(nodeId, isUUID = false) {
        nodeId = isUUID? await Node.getIdFromUUID(nodeId): nodeId;
        return this._db.blobs.where("node_id").equals(nodeId).first();
    }

    async delete(nodeId) {
        if (this._db.tables.some(t => t.name === "blobs"))
            await this._db.blobs.where("node_id").equals(nodeId).delete();

        if (this._db.tables.some(t => t.name === "index"))
            await this._db.index.where("node_id").equals(nodeId).delete();
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
            else if (archive.object) { // archive.object is an instance of Blob
                if (binarystring)
                    result = await readBlob(archive.object, "binarystring")
                else
                    result = await readBlob(archive.object, "binary")
            }
        }
        else {
            if (archive.data)
                result = archive.data;
            else if (archive.object)
                result = await readBlob(archive.object, "text");
        }

        return result;
    }
}

