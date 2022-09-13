import {CLOUD_SHELF_UUID} from "./storage.js";

const CLOUD_VERSION = 1; // cloud v1 uses v3 JSON format

const o = n => n?.node;

export class CloudStorage {
    constructor(meta) {
        this._meta = meta || {};
        this._meta.version = CLOUD_VERSION;
        this._meta.timestamp = Date.now();
        this._objects = new Map();
    }

    static deserialize(jsonLines) {
        const storage = new CloudStorage();

        const lines = jsonLines.split("\n").filter(s => !!s);
        storage._meta = lines.length? JSON.parse(lines.shift()): {};

        const objectsJSON = lines.shift();
        if (objectsJSON) {
            const objects = JSON.parse(objectsJSON);
            if (objects.nodes)
                for (const object of objects.nodes)
                    storage._objects.set(o(object).uuid, object);
        }

        if (!storage._meta.timestamp)
            storage._meta.timestamp = Date.now();

        return storage;
    }

    serialize() {
        this._meta.timestamp = Date.now();
        const lines = [JSON.stringify(this._meta)];
        const objects = {nodes: Array.from(this._objects.values())};
        lines.push(JSON.stringify(objects));
        return lines.join("\n");
    }

    addNode(object) {
        this._objects.set(o(object).uuid, object);
    }

    getNode(uuid) {
        return o(this._objects.get(uuid));
    }

    updateNode(object) {
        const existing = this._objects.get(object.uuid);
        if (existing) {
            const node = o(existing);
            Object.assign(node, object);
        }
    }

    async moveNode(node, dest) {
        const pos = node.pos;
        node = this.getNode(node.uuid);
        if (node) {
            node.pos = pos;
            node.parent_id = dest.uuid;
            node.date_modified = Date.now();
        }
    }

    deleteNodes(nodes) {
        if (!Array.isArray(nodes))
            nodes = [nodes];

        for (let node of nodes)
            this._objects.delete(node.uuid);
    }

    get nodes() {
        return Array.from(this._objects.values()).map(v => o(v));
    }

    get objects() {
        return this._treeSortObjects();
    }

    _treeSortObjects() {
        const children = new Map();
        children.set(CLOUD_SHELF_UUID, []);

        for (const object of this._objects.values()) {
            if (children.has(o(object).parent_id))
                children.get(o(object).parent_id).push(o(object).uuid);
            else
                children.set(o(object).parent_id, [o(object).uuid]);
        }

        const getSubtree = (parentUUID, acc = []) => {
            const childrenUUIDs = children.get(parentUUID);

            if (childrenUUIDs)
                for (const uuid of childrenUUIDs) {
                    acc.push(this._objects.get(uuid));
                    getSubtree(uuid, acc);
                }

            return acc;
        }

        return getSubtree(CLOUD_SHELF_UUID);
    }
}
