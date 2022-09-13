import {MarshallerJSONScrapbook, UnmarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";

export class NotesProxy {
    #marshaller = new MarshallerJSONScrapbook();
    #unmarshaller = new UnmarshallerJSONScrapbook();
    #adapter;

    constructor(adapter) {
        this.#adapter = adapter;
    }

    async storeIndex(node, words) {
        const result = await this.wrapped.storeIndex(node, words);

        await this.#persistNotesIndex(node, words);

        return result;
    }

    async _add(node, options) {
        return this.#persistNotes(node, options);
    }

    async get(node) {
        const notes = await this.#adapter.fetchNotes({uuid: node.uuid});
        if (notes)
            return this.#unmarshaller.deserializeNotes(notes);
    }

    async #persistNotesIndex(node, words) {
        if (this.#adapter.accepts(node)) {
            let index = this.wrapped.indexEntity(node, words);
            index = await this.#marshaller.serializeIndex(index);

            const params = {
                uuid: node.uuid,
                index_json: JSON.stringify(index)
            };

            return this.#adapter.persistNotesIndex(params);
        }
    }

    async #persistNotes(node, options) {
        if (this.#adapter.accepts(node)) {
            const notes = await this.#marshaller.serializeNotes(options);

            const params = {
                uuid: node.uuid,
                notes_json: JSON.stringify(notes)
            };

            await this.#adapter.persistNotes(params);
        }
    }
}
