import {
    CLOUD_SHELF_ID,
    DEFAULT_POSITION,
    DEFAULT_SHELF_ID,
    DEFAULT_SHELF_NAME,
    DONE_SHELF_NAME,
    FIREFOX_SHELF_ID,
    NODE_PROPERTIES,
    NODE_TYPE_GROUP,
    NODE_TYPE_NOTES,
    NODE_TYPE_SHELF,
    TODO_SHELF_NAME,
    TODO_STATE_DONE,
    isContainer
} from "./storage_constants.js";

import UUID from "./lib/uuid.js"
import Dexie from "./lib/dexie.js"
import {notes2html, stringByteLengthUTF8} from "./utils.js";


const dexie = new Dexie("scrapyard");

dexie.version(1).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,tag_list,date_added,date_modified,todo_state,todo_date`,
    blobs: `++id,&node_id,size`,
    index: `++id,&node_id,*words`,
    notes: `++id,&node_id`,
    tags: `++id,name`
});
dexie.version(2).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,tag_list,date_added,date_modified,todo_state,todo_date,external,external_id`,
    blobs: `++id,&node_id,size`,
    index: `++id,&node_id,*words`,
    notes: `++id,&node_id`,
    tags: `++id,name`
});
dexie.version(3).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,tag_list,date_added,date_modified,todo_state,todo_date,external,external_id`,
    blobs: `++id,&node_id,size`,
    index: `++id,&node_id,*words`,
    notes: `++id,&node_id`,
    tags: `++id,name`,
    icons: `++id,&node_id`
});
dexie.version(4).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,tag_list,date_added,date_modified,todo_state,todo_date,external,external_id`,
    blobs: `++id,&node_id,size`,
    index: `++id,&node_id,*words`,
    notes: `++id,&node_id`,
    tags: `++id,name`,
    icons: `++id,&node_id`,
    comments: `++id,&node_id`
});
dexie.version(5).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,tag_list,date_added,date_modified,todo_state,todo_date,external,external_id`,
    blobs: `++id,&node_id,size`,
    index: `++id,&node_id,*words`,
    notes: `++id,&node_id`,
    tags: `++id,name`,
    icons: `++id,&node_id`,
    comments: `++id,&node_id`,
    index_notes: `++id,&node_id,*words`,
    index_comments: `++id,&node_id,*words`
});

dexie.on('populate', () => {
    dexie.nodes.add({name: DEFAULT_SHELF_NAME, type: NODE_TYPE_SHELF, uuid: "1", date_added: new Date(), pos: 1});
});

class IDBStorage {
    constructor() {
        this._dexie = dexie;
    }

    _sanitizeNode(node) {
        node = Object.assign({}, node);

        for (let key of Object.keys(node)) {
            if (!NODE_PROPERTIES.some(k => k === key))
                delete node[key];
        }

        return node;
    }

    async addNode(datum, reset_order = true, reset_dates = true, new_uuid = true) {
        if (reset_order)
            datum.pos = DEFAULT_POSITION;

        if (new_uuid)
            datum.uuid = UUID.numeric();

        if (reset_dates) {
            datum.date_added = new Date();
            datum.date_modified = datum.date_added;
        }

        datum.id = await dexie.nodes.add(this._sanitizeNode(datum));
        return datum;
    }

    isNodeExists(uuid) {
        if (!uuid)
            return false;

        return dexie.nodes.where("uuid").equals(uuid).count();
    }

    getNode(id, is_uuid = false) {
        if (is_uuid)
            return dexie.nodes.where("uuid").equals(id).first();

        return dexie.nodes.where("id").equals(id).first();
    }

    getNodes(ids) {
        if (!ids)
            return dexie.nodes.toArray();

        return dexie.nodes.where("id").anyOf(ids).toArray();
    }

    getNodeIds() {
        return dexie.nodes.orderBy("id").keys();
    }

    getExternalNode(id, kind) {
        return dexie.nodes.where("external_id").equals(id).and(n => n.external === kind).first();
    }

    getExternalNodes(kind) {
        return dexie.nodes.where("external").equals(kind).toArray();
    }

    async isExternalNodeExists(id, kind) {
        return !!(await dexie.nodes.where("external_id").equals(id).and(n => n.external === kind).count());
    }

    async deleteExternalNodes(ids, kind) {
        if (ids)
            ids = await dexie.nodes.where("external_id").anyOf(ids).and(n => n.external === kind).toArray();
        else
            ids = await dexie.nodes.where("external").equals(kind).toArray();

        return this.deleteNodesLowLevel(ids.map(n => n.id));
    }

    async deleteMissingExternalNodes(ids, kind) {
        let existing = new Set(ids);

        ids = await dexie.nodes.where("external").equals(kind).and(n => n.external_id && !existing.has(n.external_id))
            .toArray();

        return this.deleteNodesLowLevel(ids.map(n => n.id));
    }

    getChildNodes(id) {
        return dexie.nodes.where("parent_id").equals(id).toArray();
    }

    async updateNodes(nodes) {
        //return dexie.transaction('rw', dexie.nodes, async () => {
            for (let n of nodes) {
                n = this._sanitizeNode(n);

                let id = n.id;
                //delete n.id;
                n.date_modified = new Date();
                await dexie.nodes.where("id").equals(id).modify(n);
            }
        //     return nodes;
        // });
    }

    async updateNode(node, reset_date = true) {
        if (node && node.id) {
            let id = node.id;
            //delete node.id;

            if (reset_date)
                node.date_modified = new Date();

            await dexie.nodes.update(id, this._sanitizeNode(node));
        }
        return node;
    }

    iterateNodes(iterator, filter) {
        if (filter)
            return dexie.nodes.filter(filter).each(iterator);
        else
            return dexie.nodes.each(iterator);
    }

    async _selectAllChildrenIdsOf(node_id, children) {
        const _container = a => !!a[1];

        let group_children = [];
        await dexie.nodes.where("parent_id").equals(node_id)
            .each(n => group_children.push([n.id, isContainer(n)]));

        if (group_children.length) {
            for (let child of group_children) {
                children.push(child[0]);
                if (_container(child))
                    await this._selectAllChildrenIdsOf(child[0], children);
            }
        }
    }

    async _selectAllChildrenOf(node, children) {
        let group_children = await dexie.nodes.where("parent_id").equals(node.id).toArray();

        if (group_children && group_children.length) {
            for (let child of group_children) {
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
            if (node) {
                children.push(node);
                if (isContainer(node))
                    await this._selectAllChildrenOf(node, children);
            }
        }

        if (children.length && return_ids)
            return children.map(n => n.id);

        return children;
    }

    async queryNodes(group, options) {
        let {search, tags, types, path, limit, depth, order} = options;

        let where = limit
            ? dexie.nodes.limit(limit)
            : dexie.nodes;

        let searchrx = search? new RegExp(search, "i"): null;

        let subtree = [];
        if (group && (depth === "subtree" || depth === "root+subtree")) {
            await this._selectAllChildrenIdsOf(group.id, subtree);
            subtree = new Set(subtree);
        }

        let filterf = node => {
            let result = path && path !== TODO_SHELF_NAME && path !== DONE_SHELF_NAME? !!group: true;

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
            else if (path === TODO_SHELF_NAME)
                result = result && node.todo_state && node.todo_state < TODO_STATE_DONE;
            else if (path === DONE_SHELF_NAME)
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
        return dexie.nodes.where("todo_state").below(TODO_STATE_DONE).toArray();
    }

    queryDONE() {
        return dexie.nodes.where("todo_state").aboveOrEqual(TODO_STATE_DONE).toArray();
    }

    // returns nodes containing only the all given words
    async filterByContent(nodes, words, index) {
        let matches = {};
        let all_matched_nodes = [];
        let word_count = {};

        const selectIndex = index => {
            switch (index) {
                case "notes":
                    return dexie.index_notes;
                case "comments":
                    return dexie.index_comments;
                default:
                    return dexie.index;
            }
        };

        const query = nodes
            ? word => selectIndex(index).where("words").startsWith(word).and(i => nodes.some(n => n.id === i.node_id))
            : word => selectIndex(index).where("words").startsWith(word);

        for (let word of words) {
            let matched_nodes = matches[word] = [];
            await query(word).each(w => matched_nodes.push(w.node_id));
            all_matched_nodes = [...all_matched_nodes, ...matched_nodes]
                                    .filter((w, i, a) => a.indexOf(w) === i); // distinct
        }

        for (let n of all_matched_nodes) {
            word_count[n] = 0;

            for (let word of words) {
                if (matches[word].some(i => i === n))
                    word_count[n] += 1;
            }
        }

        if (nodes)
            return nodes.filter(n => word_count[n.id] === words.length);
        else {
            let nodes_with_all_words = [];

            for (const [id, count] of Object.entries(word_count)) {
                if (count === words.length)
                    nodes_with_all_words.push(parseInt(id));
            }

            return this.getNodes(nodes_with_all_words);
        }
    }

    async deleteNodesLowLevel(ids) {
        if (!Array.isArray(ids))
            ids = [ids];

        if (dexie.tables.some(t => t.name === "blobs"))
            await dexie.blobs.where("node_id").anyOf(ids).delete();

        if (dexie.tables.some(t => t.name === "index"))
            await dexie.index.where("node_id").anyOf(ids).delete();

        if (dexie.tables.some(t => t.name === "notes"))
            await dexie.notes.where("node_id").anyOf(ids).delete();

        if (dexie.tables.some(t => t.name === "icons"))
            await dexie.icons.where("node_id").anyOf(ids).delete();

        if (dexie.tables.some(t => t.name === "comments"))
            await dexie.comments.where("node_id").anyOf(ids).delete();

        if (dexie.tables.some(t => t.name === "index_notes"))
            await dexie.index_notes.where("node_id").anyOf(ids).delete();

        if (dexie.tables.some(t => t.name === "index_comments"))
            await dexie.index_comments.where("node_id").anyOf(ids).delete();

        return dexie.nodes.bulkDelete(ids);
    }

    async wipeEveritying() {
        if (dexie.tables.some(t => t.name === "blobs"))
            await dexie.blobs.clear();

        if (dexie.tables.some(t => t.name === "index"))
            await dexie.index.clear();

        if (dexie.tables.some(t => t.name === "notes"))
            await dexie.notes.clear();

        if (dexie.tables.some(t => t.name === "tags"))
            await dexie.tags.clear();

        if (dexie.tables.some(t => t.name === "icons"))
            await dexie.icons.clear();

        if (dexie.tables.some(t => t.name === "comments"))
            await dexie.comments.clear();

        if (dexie.tables.some(t => t.name === "index_notes"))
            await dexie.index_notes.clear();

        if (dexie.tables.some(t => t.name === "index_comments"))
            await dexie.index_comments.clear();


        let retain = [DEFAULT_SHELF_ID, FIREFOX_SHELF_ID, CLOUD_SHELF_ID,
            ...(await this.queryFullSubtree(FIREFOX_SHELF_ID, true)),
            ...(await this.queryFullSubtree(CLOUD_SHELF_ID, true))];

        return dexie.nodes.where("id").noneOf(retain).delete();
    }

    async queryShelf(name) {
        let where = dexie.nodes.where("type").equals(NODE_TYPE_SHELF);

        if (name)
            return await where.and(n => name.toLocaleUpperCase() === n.name.toLocaleUpperCase())
                .first();
        else
            return await where.toArray();
    }

    queryGroup(parent_id, name) {
        return dexie.nodes.where("parent_id").equals(parent_id)
           .and(n => name.toLocaleUpperCase() === n.name.toLocaleUpperCase())
           .first();
    }

    async queryGroups(sort = false) {
        let nodes = await dexie.nodes.where("type").anyOf([NODE_TYPE_SHELF, NODE_TYPE_GROUP]).toArray();

        if (sort)
            return nodes.sort((a, b) => a.pos - b.pos);

        return nodes;
    }

    async storeBlobLowLevel(node_id, data, content_type, byte_length, index) {
        let node = await this.getNode(node_id);

        if (node) {
            if (typeof data !== "string") {
                let binaryString = "";
                let byteArray = new Uint8Array(data);

                for (let i = 0; i < byteArray.byteLength; i++)
                    binaryString += String.fromCharCode(byteArray[i]);

                node.size = byte_length = byteArray.byteLength;
                data = binaryString;
            }
            else
                node.size = stringByteLengthUTF8(data);

            await this.updateNode(node);

            await dexie.blobs.add({
                node_id: node.id,
                data: data,
                byte_length: byte_length,
                type: content_type
            });

            if (!byte_length && typeof data === "string") {
                if (index?.words)
                    await this.storeIndex(node.id, index.words);
                else {
                    let words = data.indexWords();
                    await this.storeIndex(node.id, words);
                }
            }
        }
    }

    async updateBlobLowLevel(node_id, data) {
        let node = await this.getNode(node_id);

        if (node) {
            node.size = stringByteLengthUTF8(data);
            await this.updateNode(node);

            await dexie.blobs.where("node_id").equals(node.id).modify({
                data: data
            });

            let words = data.indexWords();
            await this.updateIndex(node_id, words);
        }
    }

    async deleteBlob(node_id) {
        if (dexie.tables.some(t => t.name === "blobs"))
            await dexie.blobs.where("node_id").equals(node_id).delete();

        if (dexie.tables.some(t => t.name === "index"))
            await dexie.index.where("node_id").equals(node_id).delete();
    }

    async fetchBlob(node_id, is_uuid = false) {
        if (is_uuid) {
            let node = await dexie.nodes.where("uuid").equals(node_id).first();
            if (node)
                node_id = node.id;
        }
        let blob = await dexie.blobs.where("node_id").equals(node_id).first();

        return blob;
    }

    async storeIndex(node_id, words) {
        return dexie.index.add({
            node_id: node_id,
            words: words
        });
    }

    async updateIndex(node_id, words) {
        let exists = await dexie.index.where("node_id").equals(node_id).count();

        if (exists)
            return dexie.index.where("node_id").equals(node_id).modify({
                words: words
            });
        else
            return this.storeIndex(node_id, words);
    }

    async fetchIndex(node_id, is_uuid = false) {
        if (is_uuid) {
            let node = await dexie.nodes.where("uuid").equals(node_id).first();
            if (node)
                node_id = node.id;
        }

        return dexie.index.where("node_id").equals(node_id).first();
    }

    async storeNotesLowLevel(options) {
        let node = await this.getNode(options.node_id);
        let exists = await dexie.notes.where("node_id").equals(options.node_id).count();

        if (exists) {
            await dexie.notes.where("node_id").equals(options.node_id).modify(options);
        }
        else {
            await dexie.notes.add(options);
        }

        node.has_notes = !!options.content;

        if (node.has_notes) {
            let words;
            node.size = stringByteLengthUTF8(options.content);

            if (options.format === "delta" && options.html) {
                node.size += stringByteLengthUTF8(options.html);
                words = options.html.indexWords();
            }
            else {
                if (options.format === "text")
                    words = options.content.indexWords(false);
                else {
                    let html = notes2html(options);
                    if (html)
                        words = html.indexWords();
                }
            }

            if (words)
                await this.updateNoteIndex(node.id, words);
            else
                await this.updateNoteIndex(node.id, []);
        }
        else {
            node.size = null;
            await this.updateNoteIndex(node.id, []);
        }

        await this.updateNode(node);
    }

    async fetchNotes(node_id, is_uuid = false) {
        if (is_uuid) {
            let node = await dexie.nodes.where("uuid").equals(node_id).first();
            if (node)
                node_id = node.id;
        }

        return dexie.notes.where("node_id").equals(node_id).first();
    }

    async storeNoteIndex(node_id, words) {
        return dexie.index_notes.add({
            node_id: node_id,
            words: words
        });
    }

    async updateNoteIndex(node_id, words) {
        let exists = await dexie.index_notes.where("node_id").equals(node_id).count();

        if (exists)
            return dexie.index_notes.where("node_id").equals(node_id).modify({
                words: words
            });
        else
            return this.storeNoteIndex(node_id, words);
    }

    async storeCommentsLowLevel(node_id, comments) {
        let node = await this.getNode(node_id);
        let exists = await dexie.comments.where("node_id").equals(node_id).count();

        if (exists) {
            await dexie.comments.where("node_id").equals(node_id).modify({
                comments: comments
            });
        }
        else {
            await dexie.comments.add({
                node_id: node_id,
                comments: comments
            });
        }

        node.has_comments = !!comments;
        await this.updateNode(node);

        if (node.has_comments) {
            let words = comments.indexWords(false);
            await this.updateCommentIndex(node.id, words);
        }
        else
            await this.updateCommentIndex(node.id, []);
    }

    async fetchComments(node_id, is_uuid = false) {
        if (is_uuid) {
            let node = await dexie.nodes.where("uuid").equals(node_id).first();
            if (node)
                node_id = node.id;
        }

        let record = await dexie.comments.where("node_id").equals(node_id).first();

        return record?.comments;
    }

    async storeCommentIndex(node_id, words) {
        return dexie.index_comments.add({
            node_id: node_id,
            words: words
        });
    }

    async updateCommentIndex(node_id, words) {
        let exists = await dexie.index_comments.where("node_id").equals(node_id).count();

        if (exists)
            return dexie.index_comments.where("node_id").equals(node_id).modify({
                words: words
            });
        else
            return this.storeCommentIndex(node_id, words);
    }

    async addTags(tags) {
        if (tags)
            for (let tag of tags) {
                let exists = await dexie.tags.where("name").equals(tag).count();

                if (!exists)
                    return dexie.tags.add({name: tag});
            }
    }

    async queryTags() {
        return dexie.tags.toArray();
    }

    async storeIconLowLevel(node_id, data_url) {
        const exists = node_id? await dexie.icons.where("node_id").equals(node_id).count(): false;

        if (exists) {
            await dexie.icons.where("node_id").equals(node_id).modify({
                data_url: data_url
            });
        }
        else {
            return await dexie.icons.add({
                node_id: node_id,
                data_url: data_url
            });
        }
    }

    async updateIcon(icon_id, options) {
        await dexie.icons.update(icon_id, options);
    }

    async fetchIcon(node_id) {
        const icon = await dexie.icons.where("node_id").equals(node_id).first();

        if (icon)
            return icon.data_url;

        return null;
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
        //return dexie.transaction("rw", dexie.nodes, dexie.notes, dexie.blobs, dexie.index, dexie.tags, handler);
        return handler();
    }

}

export default IDBStorage;
