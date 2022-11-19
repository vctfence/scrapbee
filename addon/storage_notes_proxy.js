import {MarshallerJSONScrapbook, UnmarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";
import {StorageProxy} from "./storage_proxy.js";
import {Notes} from "./storage_entities.js";
import {settings} from "./settings.js";

export class NotesProxy extends StorageProxy {
    #marshaller = new MarshallerJSONScrapbook();
    #unmarshaller = new UnmarshallerJSONScrapbook();

    async storeIndex(node, words) {
        const result = await this.wrapped.storeIndex(node, words);

        await this.#persistNotesIndex(node, words);

        return result;
    }

    async _add(node, options) {
        return this.#persistNotes(node, options);
    }

    async get(node) {
        return this.#fetchNotes(node);
    }

    async #persistNotesIndex(node, words) {
        const adapter = this.adapter(node);

        if (adapter) {
            let index = this.wrapped.indexEntity(node, words);
            index = await this.#marshaller.convertIndex(index);

            const params = {
                uuid: node.uuid,
                index_json: JSON.stringify(index)
            };

            return adapter.persistNotesIndex(params);
        }
    }

    async #persistNotes(node, options) {
        const adapter = this.adapter(node);

        if (adapter) {
            const notes = await this.#marshaller.convertNotes(options);

            const params = {
                uuid: node.uuid,
                notes_json: JSON.stringify(notes),
                ...await adapter.getParams(node)
            };

            await adapter.persistNotes(params);
        }
        else if (settings.storage_mode_internal())
            return Notes.idb.add(node, options);
    }

    async #fetchNotes(node) {
        const adapter = this.adapter(node);

        if (adapter) {
            const notes = await adapter.fetchNotes({uuid: node.uuid, ...await adapter.getParams(node)});

            if (notes)
                return this.#unmarshaller.unconvertNotes(notes);
        }
        else if (settings.storage_mode_internal())
            return Notes.idb.get(node);
    }
}
