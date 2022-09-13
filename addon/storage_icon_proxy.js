import {MarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";

export class IconProxy {
    #marshaller = new MarshallerJSONScrapbook();
    #adapter;

    constructor(adapter) {
        this.#adapter = adapter;
    }

    async add(node, dataUrl) {
        const result = await this.wrapped.add(node, dataUrl);

        if (node.uuid)
            await this.#persistIcon(node, dataUrl);

        return result;
    }

    async persist(node, dataUrl) {
        await this.#persistIcon(node, dataUrl);
    }

    async #persistIcon(node, dataUrl) {
        if (this.#adapter.accepts(node)) {
            let icon = this.wrapped.entity(node, dataUrl);
            icon = this.#marshaller.serializeIcon(icon);

            const params = {
                uuid: node.uuid,
                icon_json: JSON.stringify(icon)
            };

            return this.#adapter.persistIcon(params);
        }
    }
}

