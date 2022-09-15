import {MarshallerJSONScrapbook, UnmarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";
import {Archive} from "./storage_entities.js";
import {StorageProxy} from "./storage_proxy.js";

export class ArchiveProxy extends StorageProxy {
    #marshaller = new MarshallerJSONScrapbook();
    #unmarshaller = new UnmarshallerJSONScrapbook();

    async storeIndex(node, words) {
        const result = await this.wrapped.storeIndex(node, words);

        await this.#persistArchiveIndex(node, words);

        return result;
    }

    async _add(node, data, contentType, byteLength) {
        return this.#persistArchive(node, data, contentType, byteLength);
    }

    async get(node) {
        const adapter = this.adapter(node);

        if (adapter) {
            let archive = await adapter.fetchArchive({uuid: node.uuid});

            if (archive) {
                archive = this.#unmarshaller.deserializeArchive(archive);
                return Archive.entity(null, archive.object, archive.type, archive.byte_length);
            }
        }
    }

    async #persistArchiveIndex(node, words) {
        const adapter = this.adapter(node);

        if (adapter) {
            let index = this.wrapped.indexEntity(node, words);
            index = await this.#marshaller.serializeIndex(index);

            const params = {
                uuid: node.uuid,
                index_json: JSON.stringify(index)
            };

            return adapter.persistArchiveIndex(params);
        }
    }

    async #persistArchive(node, data, contentType, byteLength) {
        const adapter = this.adapter(node);
        const entity = this.wrapped.entity(node, data, contentType, byteLength);
        let content = await Archive.reify(entity);

        if (adapter) {
            const archive = await this.#marshaller.serializeArchive(entity);

            delete archive.content;

            const params = {
                uuid: node.uuid,
                archive_json: JSON.stringify(archive),
                content: content
            };

            await adapter.persistArchive(params);
        }

        return entity;
    }
}

