import {MarshallerJSONScrapbook, UnmarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";

export class CommentsProxy {
    #marshaller = new MarshallerJSONScrapbook();
    #unmarshaller = new UnmarshallerJSONScrapbook();
    #adapter;

    constructor(adapter) {
        this.#adapter = adapter;
    }

    async storeIndex(node, words) {
        const result = await this.wrapped.storeIndex(node, words);

        await this.#persistCommentsIndex(node, words);

        return result;
    }

    async _add(node, text) {
        return this.#persistComments(node, text);
    }

    async get(node) {
        const comments = await this.#adapter.fetchComments({uuid: node.uuid});
        if (comments)
            return this.#unmarshaller.deserializeComments(comments)?.text;
    }

    async #persistCommentsIndex(node, words) {
        if (this.#adapter.accepts(node)) {
            let index = this.wrapped.indexEntity(node, words);
            index = await this.#marshaller.serializeIndex(index);

            const params = {
                uuid: node.uuid,
                index_json: JSON.stringify(index)
            };

            return this.#adapter.persistCommentsIndex(params);
        }
    }

    async #persistComments(node, text) {
        if (this.#adapter.accepts(node)) {
            const comments = await this.#marshaller.serializeComments(text);

            const params = {
                uuid: node.uuid,
                comments_json: JSON.stringify(comments)
            };

            await this.#adapter.persistComments(params);
        }
    }
}
