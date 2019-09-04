import {readBlob} from "./utils.js";

export const NODE_TYPE_SHELF = 1;
export const NODE_TYPE_GROUP = 2;
export const NODE_TYPE_BOOKMARK = 3;
export const NODE_TYPE_ARCHIVE = 4;
export const NODE_TYPE_SEPARATOR = 5;
export const NODE_TYPE_NOTES = 6;
export const ENDPOINT_TYPES = [NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES];
export const CONTAINER_TYPES = [NODE_TYPE_SHELF, NODE_TYPE_GROUP];

export const TODO_STATE_TODO = 1;
export const TODO_STATE_DONE = 4;
export const TODO_STATE_WAITING = 2;
export const TODO_STATE_POSTPONED = 3;
export const TODO_STATE_CANCELLED = 5;

export const TODO_NAMES = {
    [TODO_STATE_TODO]: "TODO",
    [TODO_STATE_WAITING]: "WAITING",
    [TODO_STATE_POSTPONED]: "POSTPONED",
    [TODO_STATE_CANCELLED]: "CANCELLED",
    [TODO_STATE_DONE]: "DONE"
};

export const TODO_STATES = {
    "TODO": TODO_STATE_TODO,
    "WAITING": TODO_STATE_WAITING,
    "POSTPONED": TODO_STATE_POSTPONED,
    "CANCELLED": TODO_STATE_CANCELLED,
    "DONE": TODO_STATE_DONE
};

export const DEFAULT_SHELF_ID = 1;
export const EVERYTHING_SHELF = -1;
export const DONE_SHELF = -2;
export const TODO_SHELF = -3;
export const FIREFOX_SHELF_ID = -4;
export const CLOUD_SHELF_ID = -5;

export const TODO_NAME = "TODO";
export const DONE_NAME = "DONE";
export const EVERYTHING = "everything";
export const DEFAULT_SHELF_NAME = "default";
export const FIREFOX_SHELF_NAME = "firefox";
export const FIREFOX_SHELF_UUID = "browser_bookmarks";
export const CLOUD_SHELF_NAME = "cloud";

export const FIREFOX_BOOKMARK_MENU = "menu________";
export const FIREFOX_BOOKMARK_UNFILED = "unfiled_____";
export const FIREFOX_BOOKMARK_TOOLBAR = "toolbar_____";
export const FIREFOX_BOOKMARK_MOBILE = "mobile______"

export const RDF_EXTERNAL_NAME = "rdf";

export const CLOUD_EXTERNAL_NAME = "cloud";

export const SPECIAL_UUIDS = [FIREFOX_SHELF_UUID, CLOUD_EXTERNAL_NAME];

export const DEFAULT_POSITION = 2147483647;

export const NODE_PROPERTIES =
    ["id",
    "pos",
    "uri",
    "name",
    "type",
    "uuid",
    "icon",
    "tags",
    "tag_list",
    "details",
    "parent_id",
    "todo_date",
    "todo_state",
    "date_added",
    "date_modified",
    "has_notes",
    "external",
    "external_id"
];

import UUID from "./lib/uuid.js"
import Dexie from "./lib/dexie.js"
//import LZString from "./lib/lz-string.js"

const db = new Dexie("scrapyard");

db.version(1).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,tag_list,date_added,date_modified,todo_state,todo_date`,
    blobs: `++id,&node_id,size`,
    index: `++id,&node_id,*words`,
    notes: `++id,&node_id`,
    tags: `++id,name`,
});
db.version(2).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,tag_list,date_added,date_modified,todo_state,todo_date,external,external_id`,
    blobs: `++id,&node_id,size`,
    index: `++id,&node_id,*words`,
    notes: `++id,&node_id`,
    tags: `++id,name`,
});

db.on('populate', () => {
    db.nodes.add({name: DEFAULT_SHELF_NAME, type: NODE_TYPE_SHELF, uuid: "1", date_added: new Date(), pos: 1});
});

export function isContainer(node) {
    return node && CONTAINER_TYPES.some(t => t == node.type);
}

export function isEndpoint(node) {
    return node && ENDPOINT_TYPES.some(t => t == node.type);
}

export function isSpecialShelf(name) {
    name = name.toLocaleUpperCase();
    return name === DEFAULT_SHELF_NAME.toLocaleUpperCase()
        || name === FIREFOX_SHELF_NAME.toLocaleUpperCase()
        || name === CLOUD_SHELF_NAME.toLocaleUpperCase()
        || name === EVERYTHING.toLocaleUpperCase()
        || name === TODO_NAME.toLocaleUpperCase()
        || name === DONE_NAME.toLocaleUpperCase();
}

class Storage {
    constructor() {
        this.db = db;
    }

    _sanitizeNode(node) {
        node = Object.assign({}, node);

        for (let key of Object.keys(node)) {
            if (!NODE_PROPERTIES.some(k => k === key))
                delete node[key];
        }

        return node;
    }

    async addNode(datum, reset_order = true, new_uuid = true, reset_dates = true) {
        datum = this._sanitizeNode(datum);

        if (reset_order)
            datum.pos = DEFAULT_POSITION;

        if (!SPECIAL_UUIDS.some(uuid => uuid === datum.uuid) && new_uuid)
            datum.uuid = UUID.numeric();

        if (reset_dates) {
            datum.date_added = new Date();
            datum.date_modified = datum.date_added;
        }

        datum.id = await db.nodes.add(datum);
        return datum;
    }

    getNode(id, is_uuid = false) {
        if (is_uuid)
            return db.nodes.where("uuid").equals(id).first();

        return db.nodes.where("id").equals(id).first();
    }

    getNodes(ids) {
        if (!ids)
            return db.nodes.toArray();

        return db.nodes.where("id").anyOf(ids).toArray();
    }

    getExternalNode(id, kind) {
        return db.nodes.where("external_id").equals(id).and(n => n.external === kind).first();
    }

    getExternalNodes(kind) {
        return db.nodes.where("external").equals(kind).toArray();
    }

    isExternalNodeExists(id, kind) {
        return !!db.nodes.where("external_id").equals(id).and(n => n.external === kind).count();
    }

    async deleteExternalNodes(ids, kind) {
        if (ids)
            ids = await db.nodes.where("external_id").anyOf(ids).and(n => n.external === kind).toArray();
        else
            ids = await db.nodes.where("external").equals(kind).toArray();

        return this.deleteNodesLowLevel(ids.map(n => n.id));
    }

    async deleteMissingExternalNodes(ids, kind) {
        let existing = new Set(ids);

        ids = await db.nodes.where("external").equals(kind).and(n => n.external_id && !existing.has(n.external_id))
            .toArray();

        return this.deleteNodesLowLevel(ids.map(n => n.id));
    }

    getChildNodes(id) {
        return db.nodes.where("parent_id").equals(id).toArray();
    }

    async updateNodes(nodes) {
        //return db.transaction('rw', db.nodes, async () => {
            for (let n of nodes) {
                n = this._sanitizeNode(n);

                let id = n.id;
                //delete n.id;
                n.date_modified = new Date();
                await db.nodes.where("id").equals(id).modify(n);
            }
        //     return nodes;
        // });
    }

    async updateNode(node, reset_date = true) {
        if (node && node.id) {
            node = this._sanitizeNode(node);

            let id = node.id;
            //delete node.id;

            if (reset_date)
                node.date_modified = new Date();

            await db.nodes.update(id, node);
        }
        return node;
    }

    async _selectAllChildrenOf(node, children) {
        let group_children = await db.nodes.where("parent_id").equals(node.id).toArray();

        if (group_children && group_children.length) {
            for (let child of group_children) {
                console.log(children);
                children.push(child);
                if (isContainer(child))
                    await this._selectAllChildrenOf(child, children);
            }
        }
    }

    async queryFullSubtree(ids, return_ids = false, preorder = false) {
        if (!Array.isArray(ids))
            ids = [ids];

        let children = [];
        for (let id of ids) {
            let node = await this.getNode(id);
            children.push(node);
            if (isContainer(node))
                await this._selectAllChildrenOf(node, children);
        }

        if (return_ids)
            return children.map(n => n.id);

        return children;
    }

    async queryNodes(group, options) {
        let {search, tags, types, path, limit, depth, order} = options;

        let where = limit
            ? db.nodes.limit(limit)
            : db.nodes;

        let searchrx = search? new RegExp(search, "i"): null;

        let subtree = [];
        if (group && (depth === "subtree" || depth === "root+subtree")) {
            await this._selectAllChildrenOf(group, subtree);
            subtree = new Set(subtree.map(n => n.id));
        }

        let filterf = node => {
            let result = path && path !== TODO_NAME && path !== DONE_NAME? !!group: true;

            if (types)
                result = result && types.some(t => t == node.type);

            if (search)
                result = result && (searchrx.test(node.name) || searchrx.test(node.uri));

            if (group && depth === "group")
                result = result && node.parent_id === group.id;
            else if (group && depth === "subtree")
                result = result && subtree.has(node.id);
            else if (group && depth === "root+subtree")
                result = result && (subtree.has(node.id) || node.id === group.id);
            else if (path === TODO_NAME)
                result = result && node.todo_state && node.todo_state < TODO_STATE_DONE;
            else if (path === DONE_NAME)
                result = result && node.todo_state && node.todo_state >= TODO_STATE_DONE;

            if (tags) {
                if (node.tag_list) {
                    let intersection = tags.filter(value => node.tag_list.some(t => t.startsWith(value)));
                    result = result && intersection.length > 0;
                }
                else
                    result = false;
            }

            return result;
        };

        let nodes = await where.filter(filterf).toArray();

        if (order === "custom")
            nodes.sort((a, b) => a.pos - b.pos);

        return nodes;
    }

    queryTODO() {
        return db.nodes.where("todo_state").below(TODO_STATE_DONE).toArray();
    }

    queryDONE() {
        return db.nodes.where("todo_state").aboveOrEqual(TODO_STATE_DONE).toArray();
    }

    // returns nodes containing only all given words
    async filterByContent(nodes, words) {
        let node_ids = nodes.map(n => n.id);
        let matches = {};
        let all_matched_nodes = [];
        let word_count = {};

        for (let word of words) {
            matches[word] = (await db.index.where("words").startsWith(word).and(n => node_ids.some(id => id === n.node_id))
                .toArray()).map(n => n.node_id);
            all_matched_nodes = all_matched_nodes.concat(matches[word]).filter((v, i, a) => a.indexOf(v) === i);
        }

        for (let n of all_matched_nodes) {
            word_count[n] = 0;

            for (let word of words) {
                if (matches[word].some(i => i === n))
                    word_count[n] += 1;
            }
        }

        return nodes.filter(n => word_count[n.id] === words.length);
    }

    async deleteNodesLowLevel(ids) {
        if (!Array.isArray(ids))
            ids = [ids];

        if (db.tables.some(t => t.name === "blobs"))
            await db.blobs.where("node_id").anyOf(ids).delete();

        if (db.tables.some(t => t.name === "index"))
            await db.index.where("node_id").anyOf(ids).delete();

        if (db.tables.some(t => t.name === "notes"))
            await db.notes.where("node_id").anyOf(ids).delete();

        return db.nodes.bulkDelete(ids);
    }

    async wipeEveritying() {
        if (db.tables.some(t => t.name === "blobs"))
            await db.blobs.clear();

        if (db.tables.some(t => t.name === "index"))
            await db.index.clear();

        if (db.tables.some(t => t.name === "notes"))
            await db.notes.clear();

        if (db.tables.some(t => t.name === "tags"))
            await db.tags.clear();

        let retain = [DEFAULT_SHELF_ID, FIREFOX_SHELF_ID, CLOUD_SHELF_ID,
            ...(await this.queryFullSubtree(FIREFOX_SHELF_ID, true)),
            ...(await this.queryFullSubtree(CLOUD_SHELF_ID, true))];

        return db.nodes.where("id").noneOf(retain).delete();
    }

    async queryShelf(name) {
        let where = db.nodes.where("type").equals(NODE_TYPE_SHELF);

        if (name)
            return await where.and(n => name.toLocaleUpperCase() === n.name.toLocaleUpperCase())
                .first();
        else
            return await where.toArray();
    }

    queryGroup(parent_id, name) {
        return db.nodes.where("parent_id").equals(parent_id)
           .and(n => name.toLocaleUpperCase() === n.name.toLocaleUpperCase())
           .first();
    }

    async queryGroups(sort = false) {
        let nodes = await db.nodes.where("type").anyOf([NODE_TYPE_SHELF, NODE_TYPE_GROUP]).toArray();

        if (sort)
            return nodes.sort((a, b) => a.pos - b.pos);

        return nodes;
    }

    async storeBlobLowLevel(node_id, data, content_type, compress = false) {
        let node = await this.getNode(node_id);

        let byte_length;
        if (typeof data !== "string") {
            let binaryString = "";
            let byteArray = new Uint8Array(data);

            for (let i = 0; i < byteArray.byteLength; i++)
                binaryString += String.fromCharCode(byteArray[i]);

            byte_length = byteArray.byteLength;
            data = binaryString;
        }

        // if (compress) {
        //     data = LZString.compress(data);
        // }

        if (node)
            return db.blobs.add({
                node_id: node.id,
                //compressed: compress,
                data: data,
                byte_length: byte_length,
                type: content_type
            });
    }

    async updateBlob(node_id, data, compress = false) {
        let node = await this.getNode(node_id);

        // if (compress) {
        //     data = LZString.compress(data);
        // }

        if (node)
            return db.blobs.where("node_id").equals(node.id).modify({
                //compressed: compress,
                data: data
            });
    }

    async fetchBlob(node_id, is_uuid = false, compressed = false) {
        if (is_uuid) {
            let node = await db.nodes.where("uuid").equals(node_id).first();
            if (node)
                node_id = node.id;
        }
        let blob = await db.blobs.where("node_id").equals(node_id).first();

       // if (!compressed && blob && blob.compressed)
       //     blob.data = LZString.decompress(blob.data);

        return blob;
    }

    async storeIndex(node_id, words) {
        return db.index.add({
            node_id: node_id,
            words: words
        });
    }

    async updateIndex(node_id, words) {
        return db.index.where("node_id").equals(node_id).modify({
            words: words
        });
    }

    async fetchIndex(node_id, is_uuid = false) {
        if (is_uuid) {
            let node = await db.nodes.where("uuid").equals(node_id).first();
            if (node)
                node_id = node.id;
        }

        return db.index.where("node_id").equals(node_id).first();
    }

    addNotesNode(parent_id, name) {
        return this.addNode({
            parent_id: parent_id,
            name: name,
            has_notes: true,
            type: NODE_TYPE_NOTES
        });
    }

    async storeNotesLowLevel(node_id, notes, format) {
        let node = await this.getNode(node_id);
        let exists = await db.notes.where("node_id").equals(node_id).count();

        if (exists) {
            await db.notes.where("node_id").equals(node_id).modify({
                content: notes,
                format: format
            });
        }
        else {
            await db.notes.add({
                node_id: node_id,
                content: notes,
                format: format
            });
        }

        node.has_notes = !!notes;
        return this.updateNode(node);
    }

    async fetchNotes(node_id, is_uuid = false) {
        if (is_uuid) {
            let node = await db.nodes.where("uuid").equals(node_id).first();
            if (node)
                node_id = node.id;
        }

        return db.notes.where("node_id").equals(node_id).first();
    }

    async addTags(tags) {
        if (tags)
            for (let tag of tags) {
                let exists = await db.tags.where("name").equals(tag).count();

                if (!exists)
                    return db.tags.add({name: tag});
            }
    }

    async queryTags() {
        return db.tags.toArray();
    }

    async computePath(id, is_uuid = false) {
        let path = [];
        let node = await this.getNode(id, is_uuid);

        while (node) {
            path.push(node);
            if (node.parent_id)
                node = await this.getNode(node.parent_id);
            else
                node = null;
        }

        return path.reverse();
    }

    importTransaction(handler) {
        //return db.transaction("rw", db.nodes, db.notes, db.blobs, db.index, db.tags, handler);
        return handler();
    }

}


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
            if (!NODE_PROPERTIES.some(k => k === key))
                delete node[key];
        }

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

    async updateNode(node) {
        if (node) {
            //node = this._sanitizeNode(node);
            node = Object.assign({}, node);

            //let id = node.id;
            delete node.id;
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


export default Storage;
