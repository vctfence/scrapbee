import {EntityIDB} from "./storage_idb.js";
import {indexHTML, indexString} from "./utils_html.js";
import {notes2html} from "./notes_render.js";
import {Node} from "./storage_entities.js";
import {delegateProxy} from "./proxy.js";
import {StorageAdapterDisk} from "./storage_adapter_disk.js";
import {NotesProxy} from "./storage_notes_proxy.js";

export class NotesIDB extends EntityIDB {
    static newInstance() {
        const instance = new NotesIDB();

        instance.import = delegateProxy(new NotesProxy(new StorageAdapterDisk()), new NotesIDB());
        instance.import._importer = true;

        instance.idb = {import: new NotesIDB()};
        instance.idb.import._importer = true;

        return delegateProxy(new NotesProxy(new StorageAdapterDisk()), instance);
    }

    indexEntity(node, words) {
        return {
            node_id: node.id,
            words: words
        };
    }

    async storeIndex(node, words) {
        const exists = await this._db.index_notes.where("node_id").equals(node.id).count();
        const entity = this.indexEntity(node, words);

        if (exists)
            return this._db.index_notes.where("node_id").equals(node.id).modify(entity);
        else
            return this._db.index_notes.add(entity);
    }

    async _add(node, options) {
        const exists = await this._db.notes.where("node_id").equals(options.node_id).count();

        if (exists)
            await this._db.notes.where("node_id").equals(options.node_id).modify(options);
        else
            await this._db.notes.add(options);
    }

    async add(node, options, propertyChange) {
        await this._add(node, options, propertyChange);

        if (!this._importer) {
            node.has_notes = propertyChange || !!options.content;
            await Node.updateContentModified(node);
        }

        if (options.content) {
            let words;

            if (options.format === "delta" && options.html)
                words = indexHTML(options.html);
            else {
                if (options.format === "text")
                    words = indexString(options.content);
                else {
                    let html = notes2html(options);
                    if (html)
                        words = indexHTML(html);
                }
            }

            if (words)
                await this.storeIndex(node, words);
            else
                await this.storeIndex(node, []);
        }
        else
            await this.storeIndex(node, []);
    }

    async get(node) {
        return this._db.notes.where("node_id").equals(node.id).first();
    }
}

