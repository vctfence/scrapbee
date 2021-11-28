import {EntityIDB} from "./storage_idb.js";
import {NODE_PROPERTIES} from "./storage.js";
import UUID from "./lib/uuid.js";

export class NodeIDB extends EntityIDB {
    static newInstance() {
        const instance = new NodeIDB();
        return instance;
    }

    resetDates(node) {
        node.date_added = new Date();
        node.date_modified = node.date_added;
    }

    setUUID(node) {
        node.uuid = UUID.numeric();
    }

    strip(node) {
        delete node.tag_list;
    }

    async getIdFromUUID(uuid) {
        let node = await this._db.nodes.where("uuid").equals(uuid).first();
        return node?.id;
    }

    sanitize(node) {
        for (let key of Object.keys(node)) {
            if (!NODE_PROPERTIES.some(k => k === key))
                delete node[key];
        }

        return node;
    }

    sanitized(node) {
        node = Object.assign({}, node);
        return this.sanitize(node);
    }

    async add(node) {
        delete node.pos;
        this.setUUID(node);
        this.resetDates(node);

        node.id = await this._db.nodes.add(this.sanitized(node));
        return node;
    }

    async import(node) {
        node.id = await this._db.nodes.add(this.sanitized(node));
        return node;
    }

    exists(node) {
        if (!node.uuid)
            return false;

        return this._db.nodes.where("uuid").equals(node.uuid).count();
    }

    async get(ids) {
        if (!ids)
            return this._db.nodes.toArray();

        if (Array.isArray(ids))
            return this._db.nodes.where("id").anyOf(ids).toArray();
        else
            return this._db.nodes.where("id").equals(ids).first();
    }

    async getByUUID(uuid) {
        return this._db.nodes.where("uuid").equals(uuid).first();
    }

    getChildren(id) {
        return this._db.nodes.where("parent_id").equals(id).toArray();
    }

    async update(node, resetDateModified = true) {
        if (Array.isArray(node)) {
            for (let node_ of node)
                await this.update(node_, resetDateModified)
        }
        else if (node?.id) {
            if (resetDateModified)
                node.date_modified = new Date();
            await this._db.nodes.update(node.id, this.sanitized(node));
        }
        else {
            console.error("Updating a node without id or a null reference");
            console.log(node);
        }
        return node;
    }

    async contentUpdate(node) {
        node.date_modified = new Date();
        node.content_modified = node.date_modified;
        await this._db.nodes.update(node.id, this.sanitized(node));
    }

    async batchUpdate(updater, ids) {
        const withPostprocessing = node => {
            updater(node)
            node.date_modified = new Date();
            this.sanitize(node);
        };

        if (ids)
            this._db.nodes.where("id").anyOf(ids).modify(withPostprocessing)
        else
            await this._db.nodes.toCollection().modify(withPostprocessing);
    }

    iterate(iterator, filter) {
        if (filter)
            return this._db.nodes.filter(filter).each(iterator);
        else
            return this._db.nodes.each(iterator);
    }

    filter(filter) {
        return this._db.nodes.filter(filter).toArray();
    }

    async delete(ids) {
        if (!Array.isArray(ids))
            ids = [ids];

        if (this._db.tables.some(t => t.name === "blobs"))
            await this._db.blobs.where("node_id").anyOf(ids).delete();

        if (this._db.tables.some(t => t.name === "index"))
            await this._db.index.where("node_id").anyOf(ids).delete();

        if (this._db.tables.some(t => t.name === "notes"))
            await this._db.notes.where("node_id").anyOf(ids).delete();

        if (this._db.tables.some(t => t.name === "icons"))
            await this._db.icons.where("node_id").anyOf(ids).delete();

        if (this._db.tables.some(t => t.name === "comments"))
            await this._db.comments.where("node_id").anyOf(ids).delete();

        if (this._db.tables.some(t => t.name === "index_notes"))
            await this._db.index_notes.where("node_id").anyOf(ids).delete();

        if (this._db.tables.some(t => t.name === "index_comments"))
            await this._db.index_comments.where("node_id").anyOf(ids).delete();

        return this._db.nodes.bulkDelete(ids);
    }
}

