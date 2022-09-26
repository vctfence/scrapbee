import {Node} from "./storage_entities.js";
import {MarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";
import {StorageProxy} from "./storage_proxy.js";

export class NodeProxy extends StorageProxy {
    #marshaller = new MarshallerJSONScrapbook();

    async _add(node) {
        const result = await this.wrapped._add(node);
        await this.#persistNode(node);

        return result;
    }

    async put(node) {
        const result = await this.wrapped.put(node);

        await this.#persistNode(node);

        return result;
    }

    async update(node, resetDateModified = true) {
        const result = await this.wrapped.update(node, resetDateModified);

        if (Array.isArray(node))
            await this.#updateNodes(node);
        else
            await this.#updateNode(node);

        return result;
    }

    async batchUpdate(updater, ids) {
        const result = await this.wrapped.batchUpdate(updater, ids);
        const nodes = await Node.get(ids);

        await this.#updateNodes(nodes);

        return result;
    }

    async unpersist(node) {
        return this.#unpersistNode(node);
    }

    async deleteShallow(nodes) {
        const result = await this.wrapped.deleteShallow(nodes);

        await this.#deleteNodesShallow(nodes);

        return result;
    }

    async deleteDependencies(nodes) {
        const result = await this.wrapped.deleteDependencies(nodes);

        await this.#deleteNodeContent(nodes);

        return result;
    }

    async #persistNode(node) {
        const adapter = this.adapter(node);

        if (adapter) {
            node = this.#marshaller.serializeNode(node);
            node = await this.#marshaller.convertNode(node);

            const params = {
                node: node
            };

            const result = adapter.persistNode(params);
            if (!adapter.concurrent)
                return result;
        }
    }

    async #updateNode(node) {
        const adapter = this.adapter(node);

        if (adapter) {
            if (!node.uuid)
                node.uuid = await Node.getUUIDFromId(node.id);

            node = this.#marshaller.serializeNode(node);
            node = await this.#marshaller.convertNode(node);

            const params = {
                remove_fields: Object.keys(node).filter(k => node.hasOwnProperty(k) && node[k] === undefined),
                node: node
            };

            const result = adapter.updateNode(params);
            if (!adapter.concurrent)
                return result;
        }
    }

    async #updateNodes(nodes) {
        const adapter = this.adapter(nodes);

        if (adapter) {
            const params = {
                nodes: await Promise.all(nodes.map(async node => {
                    node = this.#marshaller.serializeNode(node);
                    node = await this.#marshaller.convertNode(node);
                    return node;
                }))
            };

            const result = adapter.updateNodes(params);
            if (!adapter.concurrent)
                return result;
        }
    }

    async #unpersistNode(node) {
        const adapter = this.adapter(node);

        if (adapter) {
            const params = {
                node_uuids: [node.uuid]
            };

            const result = adapter.deleteNodes(params);
            if (!adapter.concurrent)
                return result;
        }
    }

    async #deleteNodesShallow(nodes) {
        if (!Array.isArray(nodes))
            nodes = [nodes];

        const adapter = this.adapter(nodes);

        if (adapter) {
            const params = {
                node_uuids: nodes.map(n => n.uuid)
            };

            const result = adapter.deleteNodesShallow(params);
            if (!adapter.concurrent)
                return result;
        }
    }

    async #deleteNodeContent(nodes) {
        if (!Array.isArray(nodes))
            nodes = [nodes];

        const adapter = this.adapter(nodes);

        if (adapter) {
            const params = {
                node_uuids: nodes.map(n => n.uuid)
            };

            return adapter.deleteNodeContent(params);
        }
    }
}

