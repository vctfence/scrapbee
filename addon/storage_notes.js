import {EntityIDB} from "./storage_idb.js";
import {indexHTML, indexString} from "./utils_html.js";
import {notes2html} from "./notes_render.js";
import {Node} from "./storage_entities.js";

export class NotesIDB extends EntityIDB {
    static newInstance() {
        const instance = new NotesIDB();
        instance.import = new NotesIDB();
        instance.import._importer = true;
        return instance;
    }

    async _updateIndex(nodeId, words) {
        const exists = await this._db.index_notes.where("node_id").equals(nodeId).count();

        if (exists)
            return this._db.index_notes.where("node_id").equals(nodeId).modify({
                words: words
            });
        else
            return this._db.index_notes.add({
                node_id: nodeId,
                words: words
            });
    }

    async _addRaw(options, propertyChange) {
        const exists = await this._db.notes.where("node_id").equals(options.node_id).count();

        if (exists)
            await this._db.notes.where("node_id").equals(options.node_id).modify(options);
        else
            await this._db.notes.add(options);

        if (!this._importer) {
            const node = {id: options.node_id, has_notes: propertyChange || !!options.content};
            await Node.contentUpdate(node);
        }
    }

    async add(options, propertyChange) {
        await this._addRaw(options, propertyChange);

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
                await this._updateIndex(options.node_id, words);
            else
                await this._updateIndex(options.node_id, []);
        }
        else
            await this._updateIndex(options.node_id, []);
    }

    async get(nodeId) {
        return this._db.notes.where("node_id").equals(nodeId).first();
    }
}

