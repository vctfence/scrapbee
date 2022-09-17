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

    async _add(node, archive) {
        return this.#persistArchive(node, archive);
    }

    async get(node) {
        return this.#fetchArchive(node);
    }

    async #persistArchiveIndex(node, words) {
        const adapter = this.adapter(node);

        if (adapter) {
            let index = this.wrapped.indexEntity(node, words);
            index = await this.#marshaller.convertIndex(index);

            const params = {
                uuid: node.uuid,
                index_json: JSON.stringify(index)
            };

            return adapter.persistArchiveIndex(params);
        }
    }

    async #persistArchive(node, archive) {
        const adapter = this.adapter(node);
        let content = await Archive.reify(archive);

        if (adapter) {
            archive = await this.#marshaller.convertArchive(archive);

            delete archive.content;

            const params = {
                uuid: node.uuid,
                archive_json: JSON.stringify(archive),
                content: content,
                contains: node.contains
            };

            await adapter.persistArchive(params);
        }

        return archive;
    }

    async #fetchArchive(node) {
        const adapter = this.adapter(node);

        if (adapter) {
            let archive = await adapter.fetchArchive({uuid: node.uuid, node});

            if (archive) {
                archive = this.#unmarshaller.unconvertArchive(archive);
                return Archive.entity(null, archive.object, archive.type, archive.byte_length);
            }
        }
    }
}

