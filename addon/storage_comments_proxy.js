import {MarshallerJSONScrapbook, UnmarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";
import {StorageProxy} from "./storage_proxy.js";

export class CommentsProxy extends StorageProxy {
    #marshaller = new MarshallerJSONScrapbook();
    //#unmarshaller = new UnmarshallerJSONScrapbook();

    async storeIndex(node, words) {
        const result = await this.wrapped.storeIndex(node, words);

        await this.#persistCommentsIndex(node, words);

        return result;
    }

    async _add(node, text) {
        const result = await this.wrapped._add(node, text);

        await this.#persistComments(node, text);

        return result;
    }

    // async get(node) {
    //     return await this.#fetchComments(node);
    // }

    async #persistCommentsIndex(node, words) {
        const adapter = this.adapter(node);

        if (adapter) {
            let index = this.wrapped.indexEntity(node, words);
            index = await this.#marshaller.convertIndex(index);

            const params = {
                uuid: node.uuid,
                index_json: JSON.stringify(index)
            };

            return adapter.persistCommentsIndex(params);
        }
    }

    async #persistComments(node, text) {
        const adapter = this.adapter(node);

        if (adapter) {
            const comments = await this.#marshaller.convertComments(text);

            const params = {
                uuid: node.uuid,
                comments_json: JSON.stringify(comments),
                ...await adapter.getParams(node)
            };

            await adapter.persistComments(params);
        }
    }

    // async #fetchComments(node) {
    //     const adapter = this.adapter(node);
    //
    //     if (adapter) {
    //         const comments = await adapter.fetchComments({uuid: node.uuid});
    //         if (comments)
    //             return this.#unmarshaller.unconvertComments(comments)?.text;
    //     }
    // }
}
