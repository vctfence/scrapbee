export const NODE_TYPE_SHELF = 1;
export const NODE_TYPE_GROUP = 2;
export const NODE_TYPE_BOOKMARK = 3;
export const NODE_TYPE_ARCHIVE = 4;
export const NODE_TYPE_SEPARATOR = 5;
export const ENDPOINT_TYPES = [NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK];

export const TODO_STATE_TODO = 1;
export const TODO_STATE_DONE = 4;
export const TODO_STATE_WAITING = 2;
export const TODO_STATE_POSTPONED = 3;
export const TODO_STATE_CANCELLED = 5;

export const TODO_SHELF = -3;
export const DONE_SHELF = -2;
export const EVERYTHING_SHELF = -1;

export const TODO_NAME = "TODO";
export const DONE_NAME = "DONE";
export const DEFAULT_SHELF_NAME = "default";
export const EVERYTHING = "everything";

import UUID from "./lib/uuid.js"
import Dexie from "./lib/dexie.es.js"
import LZString from "./lib/lz-string.js"

const db = new Dexie("scrapyard");

db.version(1).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,tag_list,pos,date_added,date_modified,todo_state,todo_date,todo_pos`,
    blobs: `++id,&node_id`,
    index: `++id,&node_id,*words`,
    tags: `++id,name`,
});

db.on('populate', () => {
    db.nodes.add({name: DEFAULT_SHELF_NAME, type: NODE_TYPE_SHELF, uuid: "1", date_added: new Date(), pos: 1});
});


class Storage {
    constructor() {
        this.db = db;
    }

    async addNode(datum, reset_order = true) {
        if (reset_order) {
            datum.pos = 1;
            datum.todo_pos = 1;
        }
        datum.uuid = UUID.numeric();
        datum.date_added = new Date();
        datum.id = await db.nodes.add(datum);
        return datum;
    }

    getNode(id, is_uuid = false) {
        if (is_uuid)
            return db.nodes.where("uuid").equals(id).first();

        return db.nodes.where("id").equals(id).first();
    }

    getNodes(ids) {
        return db.nodes.where("id").anyOf(ids).toArray();
    }

    getChildNodes(id) {
        return db.nodes.where("parent_id").equals(id).toArray();
    }

    async updateNodes(nodes) {
        return db.transaction('rw', db.nodes, async () => {
            for (let n of nodes) {
                let id = n.id;
                //delete n.id;
                n.date_modified = new Date();
                await db.nodes.where("id").equals(id).modify(n);
            }
            return nodes;
        });
    }

    async updateNode(node) {
        if (node && node.id) {
            let id = node.id;
            //delete node.id;
            node.date_modified = new Date();
            await db.nodes.update(id, node);
        }
        return node;
    }

    async _selectAllChildrenOf(node, children) {
        let group_children = await db.nodes.where("parent_id").equals(node.id).toArray();

        if (group_children && group_children.length) {
            for (node of group_children) {
                for (let c of group_children.map(c => c.id))
                    children.add(c);
                await this._selectAllChildrenOf(node, children);
            }
        }
    }

    async queryFullSubtree(ids) {
        if (!Array.isArray(ids))
            ids = [ids];

        let children = new Set();
        for (let n of ids) {
            children.add(n);
            await this._selectAllChildrenOf({id: n}, children);
        }

        return db.nodes.where("id").anyOf(children).toArray();
    }


    async queryNodes(group, options) {
        let {search, tags, types, path, limit, depth, order} = options;

        let where = limit
            ? db.nodes.limit(limit)
            : db.nodes;

        let searchrx = search? new RegExp(search, "i"): null;

        let subtree = new Set();
        if (group && (depth === "subtree" || depth === "root+subtree")) {
            await this._selectAllChildrenOf(group, subtree);
        }

        let nodes = await where.filter(node => {
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
        }).toArray();

        if (order === "custom")
            nodes.sort((a, b) => a.pos - b.pos);

        return nodes;
    }

    queryTODO() {
        return db.nodes.where("todo_state").below(TODO_STATE_DONE).sortBy("todo_state");
    }

    queryDONE() {
        return db.nodes.where("todo_state").aboveOrEqual(TODO_STATE_DONE).toArray();
    }

    // returns nodes containing only all given words
    async filterByContent(nodes, words) {
        let matches = {};
        let all_matched_nodes = [];
        let word_count = {};

        for (let word of words) {
            matches[word] = (await db.index.where("words").startsWith(word).toArray()).map(n => n.node_id);
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

    async deleteNodes(nodes) {
        if (!Array.isArray)
            nodes = [nodes];

        await db.blobs.where("node_id").anyOf(nodes).delete();
        await db.index.where("node_id").anyOf(nodes).delete();
        return db.nodes.bulkDelete(nodes);
    }

    async queryShelf(name) {
        let where = db.nodes.where("type").equals(NODE_TYPE_SHELF);

        if (name)
            return await where.and(n => name.toLocaleUpperCase() === n.name.toLocaleUpperCase())
                .first();
        else
            return await where.toArray();
    }

    async queryGroup(parent_id, name) {
        return await db.nodes.where("parent_id").equals(parent_id)
           .and(n => name.toLocaleUpperCase() === n.name.toLocaleUpperCase())
           .first();
    }

    async storeBlob(node_id, data, compress = true) {
        let node = await this.getNode(node_id);

        if (compress) {
            data = LZString.compress(data);
        }

        if (node)
            return db.blobs.add({
                node_id: node.id,
                compressed: compress,
                data: data
            });
    }

    async updateBlob(node_id, data, compress = true) {
        let node = await this.getNode(node_id);

        if (compress) {
            data = LZString.compress(data);
        }

        if (node)
            return db.blobs.where("node_id").equals(node.id).modify({
                compressed: compress,
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

        if (!compressed && blob.compressed)
            blob.data = LZString.decompress(blob.data);

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
}


export default Storage;
