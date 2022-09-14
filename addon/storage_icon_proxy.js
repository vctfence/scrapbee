import {MarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";
import {StorageProxy} from "./storage_proxy.js";

export class IconProxy extends StorageProxy {
    #marshaller = new MarshallerJSONScrapbook();

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
        const adapter = this.adapter(node);

        if (adapter) {
            let icon = this.wrapped.entity(node, dataUrl);
            icon = this.#marshaller.serializeIcon(icon);

            const params = {
                uuid: node.uuid,
                icon_json: JSON.stringify(icon)
            };

            return adapter.persistIcon(params);
        }
    }
}

