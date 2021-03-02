import UUID from "./lib/uuid.js";
import {DEFAULT_POSITION, NODE_PROPERTIES} from "./storage_constants.js";

export class JSONStorage {
    constructor(meta) {
        this.meta = meta || {};
        this.meta.next_id = 1;
        this.meta.date = new Date().getTime();
        this.objects = [];
    }

    static fromJSON(json) {
        let storage = new JSONStorage();
        storage.objects = JSON.parse(json);

        storage.meta = storage.objects.length? storage.objects.shift() || {}: {};

        if (!storage.meta.next_id)
            storage.meta.next_id = 1;

        if (!storage.meta.date)
            storage.meta.date = new Date().getTime();

        return storage;
    }

    serialize() {
        this.meta.date = new Date().getTime();
        return JSON.stringify([this.meta, ...this.objects], null, 1);
    }

    _sanitizeNode(node) {
        node = Object.assign({}, node);

        for (let key of Object.keys(node)) {
            if (!node[key] || !NODE_PROPERTIES.some(k => k === key))
                delete node[key];
        }

        node.stored_icon = undefined;

        return node;
    }

    _sanitizeDate(date) {
        if (date) {
            let result;

            if (date instanceof Date)
                result = date.getTime()
            else
                result = new Date(date).getTime();

            if (!isNaN(result))
                return result;
        }

        return new Date().getTime();
    }

    async addNode(datum, reset_order = true) {
        datum = this._sanitizeNode(datum);

        if (reset_order)
            datum.pos = DEFAULT_POSITION;

        datum.uuid = UUID.numeric();

        let now = new Date().getTime();

        if (!datum.date_added)
            datum.date_added = now;
        else
            datum.date_added = this._sanitizeDate(datum.date_added);

        if (!datum.date_modified)
            datum.date_modified = now;
        else
            datum.date_modified = this._sanitizeDate(datum.date_modified);

        datum.id = this.meta.next_id++;
        this.objects.push(datum);

        return datum;
    }

    async getNode(id, is_uuid = false) {
        if (is_uuid)
            return this.objects.find(n => n.uuid === id);

        return this.objects.find(n => n.id == id);
    }

    getNodes(ids) {
        return this.objects.filter(n => ids.some(id => id == n.id));
    }

    async updateNode(node, update_pos = false) {
        if (node) {
            node = this._sanitizeNode(node);

            delete node.id;
            delete node.parent_id;
            delete node.external;
            delete node.external_id;

            if (!update_pos)
                delete node.pos;

            let existing = this.objects.find(n => n.uuid === node.uuid);

            if (existing) {
                existing = Object.assign(existing, node);
                existing.date_added = this._sanitizeDate(existing.date_added);
                existing.date_modified = new Date().getTime();
                return existing;
            }
        }
    }

    async updateNodes(nodes) {
        for (let node of nodes)
            this.updateNode(node);
    }

    async deleteNodes(nodes) {
        if (!Array.isArray(nodes))
            nodes = [nodes];

        for (let node of nodes) {
            let existing = this.objects.find(n => n.uuid === node.uuid);
            this.objects.splice(this.objects.indexOf(existing), 1);
        }
    }

    async moveNode(node, dest) {
        let existing = this.objects.find(n => n.uuid === node.uuid);
        let cloud_dest = this.objects.find(n => n.uuid === dest.uuid);

        existing.pos = node.pos;
        existing.parent_id = cloud_dest.id;
    }

    async queryNodes() {
        return this.objects;
    }
}
