import {MarshallerJSONScrapbook, UnmarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";
import {Archive} from "./storage_entities.js";

export class ArchiveProxy {
    #marshaller = new MarshallerJSONScrapbook();
    #unmarshaller = new UnmarshallerJSONScrapbook();
    #adapter;

    constructor(adapter) {
        this.#adapter = adapter;
    }

    async storeIndex(node, words) {
        const result = await this.wrapped.storeIndex(node, words);

        await this.#persistArchiveIndex(node, words);

        return result;
    }

    async _add(node, data, contentType, byteLength) {
        return this.#persistArchive(node, data, contentType, byteLength);
    }

    async get(node) {
        let archive = await this.#adapter.fetchArchive({uuid: node.uuid});

        if (archive) {
            archive = this.#unmarshaller.deserializeArchive(archive);
            archive = this.#unmarshaller.preprocessArchive(archive);
            return Archive.entity(null, archive.object, archive.type, archive.byte_length);
        }
    }

    async #persistArchiveIndex(node, words) {
        if (this.#adapter.accepts(node)) {
            let index = this.wrapped.indexEntity(node, words);
            index = await this.#marshaller.serializeIndex(index);

            const params = {
                uuid: node.uuid,
                index_json: JSON.stringify(index)
            };

            return this.#adapter.persistArchiveIndex(params);
        }
    }

    async #persistArchive(node, data, contentType, byteLength) {
        const entity = this.wrapped.entity(node, data, contentType, byteLength);

        if (this.#adapter.accepts(node)) {
            const archive = await this.#marshaller.serializeArchive(entity);

            const params = {
                uuid: node.uuid,
                archive_json: JSON.stringify(archive)
            };

            await this.#adapter.persistArchive(params);
        }

        return entity;
    }
}

