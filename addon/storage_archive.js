import {EntityIDB} from "./storage_idb.js";
import {indexHTML} from "./utils_html.js";
import {arrayToBinaryString, binaryString2Array, readBlob} from "./utils_io.js";
import {Node} from "./storage_entities.js";
import {delegateProxy} from "./proxy.js";
import {StorageAdapterDisk} from "./storage_adapter_disk.js";
import {ArchiveProxy} from "./storage_archive_proxy.js";
import {ARCHIVE_TYPE_BYTES, ARCHIVE_TYPE_FILES, ARCHIVE_TYPE_TEXT} from "./storage.js";

export class ArchiveIDB extends EntityIDB {
    static newInstance() {
        const instance = new ArchiveIDB();

        instance.import = delegateProxy(new ArchiveProxy(new StorageAdapterDisk()), new ArchiveIDB());
        instance.import._importer = true;

        instance.idb = {import: new ArchiveIDB()};
        instance.idb.import._importer = true;

        return delegateProxy(new ArchiveProxy(new StorageAdapterDisk()), instance);
    }

    static newInstance_transition() {
        const instance = new ArchiveIDB();

        instance.import = new ArchiveIDB();
        instance.import._importer = true;

        instance.idb = {import: new ArchiveIDB()};
        instance.idb.import._importer = true;

        return instance
    }

    entity(node, data, contentType, byteLength) {
        contentType = contentType || "text/html";

        if (typeof data !== "string" && data?.byteLength) // from ArrayBuffer
            byteLength = data.byteLength;
        // else if (typeof data === "string" && byteLength) // from binary string
        //     data = this._binaryString2Array(data);
        //
        // data = data instanceof Blob? data: new Blob([data], {type: contentType});

        const result = {
            object: data,
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

    async _add(node, archive) {
        const exists = await this._db.blobs.where("node_id").equals(node.id).count();

        if (exists)
            await this._db.blobs.where("node_id").equals(node.id).modify(archive);
        else {
            archive.node_id = node.id;
            await this._db.blobs.add(archive);
        }

        return archive;
    }

    async add(node, archive, index) {
        await this._add(node, archive);
        await this.updateContentModified(node, archive);

        if (index?.words)
            await this.storeIndex(node, index.words);
        else if (typeof archive.object === "string" && !archive.byte_length)
            await this.storeIndex(node, indexHTML(archive.object));
    }

    async updateContentModified(node, archive) {
        if (!this._importer) {
            node.contains = node.contains || (archive.byte_length? ARCHIVE_TYPE_BYTES: undefined)
            node.content_type = archive.type;

            let blob = archive.object;
            if (!(archive.object instanceof Blob))
                blob = new Blob([archive.object], {type: archive.type});

            node.size = blob.size;

            await Node.updateContentModified(node);
        }
    }

    async updateHTML(node, data) {
        if (node.contains === ARCHIVE_TYPE_FILES) {
            const index = await this.saveFile(node, "index.html", data);

            if (index)
                await this.idb.import.storeIndex(node, index);
        }
        else {
            const entity = this.entity(node, data);

            await this._add(node, entity);
            await this.storeIndex(node, indexHTML(data));
        }

        return this.updateContentModified(node, entity);
    }

    async get(node) {
        return this._db.blobs.where("node_id").equals(node.id).first();
    }

    // get file of an unpacked archive
    async getFile(node, file) {
        // NOP, used in proxy
    }

    // save file of an unpacked archive
    async getFile(node, file, content) {
        // NOP, used in proxy
    }

    async delete(node) {
        if (this._db.tables.some(t => t.name === "blobs"))
            await this._db.blobs.where("node_id").equals(node.id).delete();

        if (this._db.tables.some(t => t.name === "index"))
            await this._db.index.where("node_id").equals(node.id).delete();
    }

    isUnpacked(node) {
        return node.contains === ARCHIVE_TYPE_FILES;
    }

    // reifying for JSON storage, leaves string (no byte_length) as is even if binarystring is specified
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
                    result = binaryString2Array(archive.object);
            }
            else {
                if (binarystring)
                    result = arrayToBinaryString(archive.object);
                else
                    result = archive.object;
            }
        }
        else {
            if (archive.data)
                result = archive.data;
            else if (archive.object instanceof Blob)
                result = await readBlob(archive.object, "text");
            else if (typeof archive.object === "string")
                result = archive.object;
            else
                result = arrayToBinaryString(archive.object);
        }

        return result;
    }
}

