import {Node} from "./storage_entities.js";
import {MarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";

export class NodeProxy {
    #marshaller = new MarshallerJSONScrapbook();
    #adapter;

    constructor(adapter) {
        this.#adapter = adapter;
    }

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

        if (!Array.isArray(node))
            await this.#updateNode(node);

        return result;
    }

    async batchUpdate(updater, ids) {
        const result = await this.wrapped.batchUpdate(updater, ids);
        const nodes = await Node.get(ids);

        await this.#updateNodes(nodes);

        return result;
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
        if (this.#adapter.accepts(node)) {
            const params = {
                node: await this.#marshaller.serializeNode(node)
            };

            // async, since requests are queued in the helper
            /*return*/ this.#adapter.persistNode(params);
        }
    }

    async #updateNode(node) {
        if (this.#adapter.accepts(node)) {
            if (!node.uuid)
                node.uuid = await Node.getUUIDFromId(node.id);

            const params = {
                remove_fields: Object.keys(node).filter(k => node.hasOwnProperty(k) && node[k] === undefined),
                node: await this.#marshaller.serializeNode(node)
            };

            /*return*/ this.#adapter.updateNode(params);
        }
    }

    async #updateNodes(nodes) {
        if (this.#adapter.accepts(nodes?.[0])) {
            const params = {
                nodes: await Promise.all(nodes.map(n => this.#marshaller.serializeNode(n)))
            };

            /*return*/ this.#adapter.updateNodes(params);
        }
    }

    async #deleteNodesShallow(nodes) {
        if (!Array.isArray(nodes))
            nodes = [nodes];

        nodes = nodes.filter(n => this.#adapter.accepts(n));

        if (nodes.length) {
            const params = {
                node_uuids: nodes.map(n => n.uuid)
            };

            /*return*/ this.#adapter.deleteNodesShallow(params);
        }
    }

    async #deleteNodeContent(nodes) {
        if (!Array.isArray(nodes))
            nodes = [nodes];

        nodes = nodes.filter(n => this.#adapter.accepts(n));

        if (nodes.length) {
            const params = {
                node_uuids: nodes.map(n => n.uuid)
            };

            return this.#adapter.deleteNodeContent(params);
        }
    }
}

