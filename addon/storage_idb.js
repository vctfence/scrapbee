import {
    isContainer,
    sanitizeNode,
    CLOUD_SHELF_ID,
    DEFAULT_POSITION,
    DEFAULT_SHELF_ID,
    DEFAULT_SHELF_NAME,
    DEFAULT_SHELF_UUID,
    DONE_SHELF_NAME,
    FIREFOX_SHELF_ID,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    TODO_SHELF_NAME,
    TODO_STATE_DONE,
    NODE_TYPE_UNLISTED
} from "./storage.js";

import UUID from "./lib/uuid.js"
import Dexie from "./lib/dexie.js"
import {indexWords} from "./utils_html.js";
import {notes2html} from "./notes_render.js";

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
dexie.version(6).stores({
    nodes: `++id,&uuid,parent_id,type,name,uri,tag_list,date_added,date_modified,todo_state,todo_date,external,external_id`,
    blobs: `++id,&node_id,size`,
    index: `++id,&node_id,*words`,
    notes: `++id,&node_id`,
    tags: `++id,name`,
    icons: `++id,&node_id`,
    comments: `++id,&node_id`,
    index_notes: `++id,&node_id,*words`,
    index_comments: `++id,&node_id,*words`,
    export_storage: `++id,process_id`,
});


dexie.on('populate', () => {
    dexie.nodes.add({name: DEFAULT_SHELF_NAME, type: NODE_TYPE_SHELF, uuid: DEFAULT_SHELF_UUID, date_added: new Date(), pos: 1});
});

class BookmarkStorage {
    constructor() {
        this._db = dexie;
    }

    async _IdFromUUID(uuid) {
        let node = await this._db.nodes.where("uuid").equals(uuid).first();
        return node?.id;
    }

    transaction(mode, table, operation) {
        return this._db.transaction(mode, this._db[table], operation);
    }

    async addNode(datum, resetOrder = true, resetDates = true, newUUID = true) {
        if (resetOrder)
            datum.pos = DEFAULT_POSITION;

        if (newUUID)
            datum.uuid = UUID.numeric();

        if (resetDates) {
            datum.date_added = new Date();
            datum.date_modified = datum.date_added;
        }

        datum.id = await this._db.nodes.add(sanitizeNode(datum));
        return datum;
    }

    isNodeExists(uuid) {
        if (!uuid)
            return false;

        return this._db.nodes.where("uuid").equals(uuid).count();
    }

    async getNode(id, isUUID = false) {
        if (isUUID)
            return this._db.nodes.where("uuid").equals(id).first();
        else
            return this._db.nodes.where("id").equals(id).first();
    }

    getNodes(ids) {
        if (!ids)
            return this._db.nodes.toArray();

        return this._db.nodes.where("id").anyOf(ids).toArray();
    }

    getNodeIds() {
        return this._db.nodes.orderBy("id").keys();
    }

    getExternalNode(externalId, kind) {
        return this._db.nodes.where("external_id").equals(externalId).and(n => n.external === kind).first();
    }

    getExternalNodes(kind) {
        return this._db.nodes.where("external").equals(kind).toArray();
    }

    async isExternalNodeExists(externalId, kind) {
        return !!(await this._db.nodes.where("external_id").equals(externalId).and(n => n.external === kind).count());
    }

    async deleteExternalNodes(kind) {
        const ids = [];
        await this._db.nodes.where("external").equals(kind).each(n => ids.push(n.id));
        return this.deleteNodesLowLevel(ids);
    }

    async deleteMissingExternalNodes(externalIds, kind) {
        const existing = new Set(externalIds);

        const ids = [];
        await this._db.nodes.where("external").equals(kind)
            .and(n => n.external_id && !existing.has(n.external_id))
            .each(n => ids.push(n.id));

        return this.deleteNodesLowLevel(ids);
    }

    getChildNodes(id) {
        return this._db.nodes.where("parent_id").equals(id).toArray();
    }

    async updateNodes(nodes, ids) {
        if (typeof nodes === "function") {
            const postprocess = node => {
                nodes(node)
                node.date_modified = new Date();
                sanitizeNode(node);
            };

            if (ids)
                this._db.nodes.where("id").anyOf(ids).modify(postprocess)
            else
                await this._db.nodes.toCollection().modify(postprocess);
        }
        else {
            for (let node of nodes) {
                node.date_modified = new Date();
                await this._db.nodes.where("id").equals(node.id).modify(sanitizeNode(node));
            }
        }
    }

    async updateNode(node, resetDate = true) {
        if (node?.id) {
            if (resetDate)
                node.date_modified = new Date();
            await this._db.nodes.update(node.id, sanitizeNode(node));
        }
        return node;
    }

    iterateNodes(iterator, filter) {
        if (filter)
            return this._db.nodes.filter(filter).each(iterator);
        else
            return this._db.nodes.each(iterator);
    }

    filterNodes(filter) {
        return this._db.nodes.filter(filter).toArray();
    }

    async _selectDirectChildrenIdsOf(id, children) {
        await this._db.nodes.where("parent_id").equals(id).each(n => children.push(n.id));
    }

    async _selectAllChildrenIdsOf(id, children) {
        let directChildren = [];
        await this._db.nodes.where("parent_id").equals(id)
            .each(n => directChildren.push([n.id, isContainer(n)]));

        if (directChildren.length) {
            for (let child of directChildren) {
                children.push(child[0]);
                if (child[1])
                    await this._selectAllChildrenIdsOf(child[0], children);
            }
        }
    }

    async queryFullSubtreeIds(ids) {
        if (!Array.isArray(ids))
            ids = [ids];

        let children = [];

        for (let id of ids) {
            children.push(id);
            await this._selectAllChildrenIdsOf(id, children);
        }

        return children;
    }

    async _selectAllChildrenOf(node, children, preorder, level) {
        let directChildren = await this._db.nodes.where("parent_id").equals(node.id).toArray();

        if (directChildren.length) {
            if (preorder)
                directChildren.sort((a, b) => a.pos - b.pos);

            for (let child of directChildren) {
                if (level !== undefined)
                    child.__level = level;

                children.push(child);

                if (isContainer(child))
                    await this._selectAllChildrenOf(child, children, preorder, level !== undefined? level + 1: undefined);
            }
        }
    }

    async queryFullSubtree(ids, return_ids, preorder, level) {
        if (!Array.isArray(ids))
            ids = [ids];

        let nodes = await this.getNodes(ids);
        let children = [];

        if (preorder)
            nodes.sort((a, b) => a.pos - b.pos);

        for (let node of nodes) {
            if (node) {
                if (level !== undefined)
                    node.__level = level;

                children.push(node);

                if (isContainer(node))
                    await this._selectAllChildrenOf(node, children, preorder, level !== undefined? level + 1: undefined);
            }
        }

        if (children.length && return_ids)
            return children.map(n => n.id);

        return children;
    }

    async queryNodes(group, options) {
        let {search, tags, date, date2, period, types, path, limit, depth, order} = options;
        let searchrx = search? new RegExp(search, "i"): null;
        let query = this._db.nodes;

        const todoShelf = path?.toUpperCase() === TODO_SHELF_NAME;
        const doneShelf = path?.toUpperCase() === DONE_SHELF_NAME;

        if (group) {
            let subtree = [];

            if (depth === "group")
                await this._selectDirectChildrenIdsOf(group.id, subtree);
            else if (depth === "root+subtree") {
                await this._selectAllChildrenIdsOf(group.id, subtree);
                subtree.push(group.id);
            }
            else // "subtree"
                await this._selectAllChildrenIdsOf(group.id, subtree);

            query = query.where("id").anyOf(subtree);
        }

        if (date) {
            date = (new Date(date)).getTime();
            date2 = (new Date(date2)).getTime();
            if (isNaN(date))
                date = null;
            if (isNaN(date2))
                date2 = null;
            if (date && (period === "before" || period === "after"))
                period = period === "after" ? 1 : -1;
            else if (date && date2 && period === "between")
                period = 2;
            else
                period = 0;
        }

        let filterf = node => {
            let result = path && !todoShelf && !doneShelf? !!group: true;

            if (types)
                result = result && types.some(t => t == node.type);

            if (todoShelf)
                result = result && node.todo_state && node.todo_state < TODO_STATE_DONE;
            else if (doneShelf)
                result = result && node.todo_state && node.todo_state >= TODO_STATE_DONE;

            if (search)
                result = result && (searchrx.test(node.name) || searchrx.test(node.uri));
            else if (tags) {
                if (node.tag_list) {
                    let intersection = tags.filter(value => node.tag_list.some(t => t.startsWith(value)));
                    result = result && intersection.length > 0;
                }
                else
                    result = false;
            }
            else if (date) {
                const nodeMillis = node.date_added?.getTime? node.date_added.getTime(): undefined;

                if (nodeMillis) {
                    let nodeDate = new Date(nodeMillis);
                    nodeDate.setUTCHours(0, 0, 0, 0);
                    nodeDate = nodeDate.getTime();

                    if (period === 0)
                        result = result && date === nodeDate;
                    else if (period === 1)
                        result = result && date < nodeDate;
                    else if (period === -1)
                        result = result && date > nodeDate;
                    else if (period === 2)
                        result = result && nodeDate >= date && nodeDate <= date2;
                }
                else
                    result = false;
            }

            return result;
        };

        query = query.filter(filterf);

        if (limit)
            query = query.limit(limit);

        let nodes = await query.toArray();

        if (order === "custom")
            nodes.sort((a, b) => a.pos - b.pos);

        return nodes;
    }

    // returns nodes containing only the all given words
    async filterByContent(ids, words, index) {
        let matches = {};
        let allMatchedNodes = [];
        let wordCount = {};

        const selectIndex = index => {
            switch (index) {
                case "notes":
                    return this._db.index_notes;
                case "comments":
                    return this._db.index_comments;
                default:
                    return this._db.index;
            }
        };

        const query = ids
            ? word => selectIndex(index).where("words").startsWith(word).and(i => ids.some(id => id === i.node_id))
            : word => selectIndex(index).where("words").startsWith(word);

        for (let word of words) {
            let matched_nodes = matches[word] = [];
            await query(word).each(w => matched_nodes.push(w.node_id));
            allMatchedNodes = [...allMatchedNodes, ...matched_nodes]
                                    .filter((w, i, a) => a.indexOf(w) === i); // distinct
        }

        for (let n of allMatchedNodes) {
            wordCount[n] = 0;

            for (let word of words) {
                if (matches[word].some(i => i === n))
                    wordCount[n] += 1;
            }
        }

        if (ids)
            return this.getNodes(ids.filter(id => wordCount[id] === words.length));
        else {
            let nodesWithAllWords = [];

            for (const [id, count] of Object.entries(wordCount)) {
                if (count === words.length)
                    nodesWithAllWords.push(parseInt(id));
            }

            return this.getNodes(nodesWithAllWords);
        }
    }

    async deleteNodesLowLevel(ids) {
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

    async wipeEverything() {
        const retain = [DEFAULT_SHELF_ID, FIREFOX_SHELF_ID, CLOUD_SHELF_ID,
            ...(await this.queryFullSubtree(FIREFOX_SHELF_ID, true)),
            ...(await this.queryFullSubtree(CLOUD_SHELF_ID, true))];

        if (this._db.tables.some(t => t.name === "blobs"))
            await this._db.blobs.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "index"))
            await this._db.index.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "notes"))
            await this._db.notes.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "icons"))
            await this._db.icons.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "comments"))
            await this._db.comments.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "index_notes"))
            await this._db.index_notes.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "index_comments"))
            await this._db.index_comments.where("node_id").noneOf(retain).delete();

        if (this._db.tables.some(t => t.name === "tags"))
            await this._db.tags.clear();

        return this._db.nodes.where("id").noneOf(retain).delete();
    }

    async queryShelf(name) {
        let where = this._db.nodes.where("type").equals(NODE_TYPE_SHELF).and(n => !n.parent_id);

        if (name) {
            name = name.toLocaleUpperCase();
            return await where.and(n => name === n.name.toLocaleUpperCase()).first();
        }
        else
            return await where.toArray();
    }

    async queryUnlisted(name) {
        let where = this._db.nodes.where("type").equals(NODE_TYPE_UNLISTED);

        if (name) {
            name = name.toLocaleUpperCase();
            return await where.and(n => name === n.name.toLocaleUpperCase()).first();
        }
        else
            return await where.toArray();
    }

    querySubgroup(parentId, name) {
        name = name.toLocaleUpperCase();
        return this._db.nodes.where("parent_id").equals(parentId)
           .and(n => name === n.name.toLocaleUpperCase())
           .first();
    }

    queryTODO() {
        return this._db.nodes.where("todo_state").below(TODO_STATE_DONE).toArray();
    }

    queryDONE() {
        return this._db.nodes.where("todo_state").aboveOrEqual(TODO_STATE_DONE).toArray();
    }

    async queryGroups(sort = false) {
        const nodes = await this._db.nodes.where("type").anyOf([NODE_TYPE_SHELF, NODE_TYPE_GROUP]).toArray();

        if (sort)
            return nodes.sort((a, b) => a.pos - b.pos);

        return nodes;
    }

    async storeIndex(nodeId, words) {
        return this._db.index.add({
            node_id: nodeId,
            words: words
        });
    }

    async updateIndex(nodeId, words) {
        const exists = await this._db.index.where("node_id").equals(nodeId).count();

        if (exists)
            return this._db.index.where("node_id").equals(nodeId).modify({
                words: words
            });
        else
            return this.storeIndex(nodeId, words);
    }

    async fetchIndex(nodeId, isUUID = false) {
        nodeId = isUUID? await this._IdFromUUID(nodeId): nodeId;
        return this._db.index.where("node_id").equals(nodeId).first();
    }


    // at first all objects were stored as plain strings
    // modern implementation stores objects in blobs
    async storeBlobLowLevel(nodeId, data, contentType, byteLength) {
        if (typeof data !== "string" && data.byteLength)
            byteLength = data.byteLength;
        else if (typeof data === "string" && byteLength) {
            let byteArray = new Uint8Array(byteLength);
            for (let i = 0; i < data.length; ++i)
                byteArray[i] = data.charCodeAt(i);
            data = byteArray;
        }

        let object = data instanceof Blob? data: new Blob([data], {type: contentType});

        let options = {
            node_id: nodeId,
            // data, // legacy string content, may present in existing records
            object, // new blob content
            byte_length: byteLength, // presence of this field indicates that the the object is binary
            type: contentType || "text/html"
        };

        await this._db.blobs.add(options);

        const node = {id: nodeId, size: object.size, content_type: contentType};
        await this.updateNode(node);
    }

    // used only for text/html edited content
    async updateBlobLowLevel(nodeId, data) {
        const object = new Blob([data], {type: "text/html"});

        await this._db.blobs.where("node_id").equals(nodeId).modify({
            object,
            data: undefined // undefined removes fields from IDB
        });

        const node = {id: nodeId, size: object.size};
        await this.updateNode(node);
    }

    async storeIndexedBlob(nodeId, data, contentType, byteLength, index) {
        await this.storeBlobLowLevel(nodeId, data, contentType, byteLength);

        if (index?.words)
            await this.storeIndex(nodeId, index.words);
        else if (typeof data === "string" && !byteLength)
            await this.storeIndex(nodeId, indexWords(data));
    }

    async fetchBlob(nodeId, isUUID = false) {
        nodeId = isUUID? await this._IdFromUUID(nodeId): nodeId;
        return this._db.blobs.where("node_id").equals(nodeId).first();
    }

    async deleteBlob(nodeId) {
        if (this._db.tables.some(t => t.name === "blobs"))
            await this._db.blobs.where("node_id").equals(nodeId).delete();

        if (this._db.tables.some(t => t.name === "index"))
            await this._db.index.where("node_id").equals(nodeId).delete();
    }

    async storeNotesLowLevel(options) {
        const exists = await this._db.notes.where("node_id").equals(options.node_id).count();

        if (exists)
            await this._db.notes.where("node_id").equals(options.node_id).modify(options);
        else
            await this._db.notes.add(options);

        await this.updateNode({id: options.node_id, has_notes: !!options.content});
    }

    async storeIndexedNotes(options) {
        await this.storeNotesLowLevel(options);

        if (options.content) {
            let words;

            if (options.format === "delta" && options.html)
                words = indexWords(options.html);
            else {
                if (options.format === "text")
                    words = indexWords(options.content, false);
                else {
                    let html = notes2html(options);
                    if (html)
                        words = indexWords(html);
                }
            }

            if (words)
                await this.updateNotesIndex(options.node_id, words);
            else
                await this.updateNotesIndex(options.node_id, []);
        }
        else
            await this.updateNotesIndex(options.node_id, []);
    }

    async fetchNotes(nodeId, isUUID = false) {
        nodeId = isUUID? await this._IdFromUUID(nodeId): nodeId;
        return this._db.notes.where("node_id").equals(nodeId).first();
    }

    async updateNotesIndex(nodeId, words) {
        const exists = await this._db.index_notes.where("node_id").equals(nodeId).count();

        if (exists)
            return this._db.index_notes.where("node_id").equals(nodeId).modify({
                words: words
            });
        else
            return this._db.index_notes.add({
                node_id: nodeId,
                words: words
            });
    }

    async storeCommentsLowLevel(nodeId, comments) {
        const exists = await this._db.comments.where("node_id").equals(nodeId).count();

        if (!comments)
            comments = undefined;

        if (exists) {
            await this._db.comments.where("node_id").equals(nodeId).modify({
                comments: comments
            });
        }
        else {
            await this._db.comments.add({
                node_id: nodeId,
                comments: comments
            });
        }

        const node = {id: nodeId, has_comments: !!comments};
        await this.updateNode(node);
    }

    async storeIndexedComments(nodeId, comments) {
        await this.storeCommentsLowLevel(nodeId, comments);

        if (comments) {
            let words = indexWords(comments, false);
            await this.updateCommentIndex(nodeId, words);
        }
        else
            await this.updateCommentIndex(nodeId, []);
    }

    async fetchComments(nodeId, isUUID = false) {
        nodeId = isUUID? await this._IdFromUUID(nodeId): nodeId;

        let record = await this._db.comments.where("node_id").equals(nodeId).first();

        return record?.comments;
    }

    async updateCommentIndex(nodeId, words) {
        let exists = await this._db.index_comments.where("node_id").equals(nodeId).count();

        if (exists)
            return this._db.index_comments.where("node_id").equals(nodeId).modify({
                words: words
            });
        else
            return this._db.index_comments.add({
                node_id: nodeId,
                words: words
            });
    }

    async addTags(tags) {
        if (tags)
            for (let tag of tags) {
                let exists = await this._db.tags.where("name").equals(tag).count();

                if (!exists)
                    return this._db.tags.add({name: tag});
            }
    }

    async queryTags() {
        return this._db.tags.toArray();
    }

    async storeIconLowLevel(nodeId, dataUrl) {
        const exists = nodeId? await this._db.icons.where("node_id").equals(nodeId).count(): false;

        if (exists) {
            await this._db.icons.where("node_id").equals(nodeId).modify({
                data_url: dataUrl
            });
        }
        else {
            return await this._db.icons.add({
                node_id: nodeId,
                data_url: dataUrl
            });
        }
    }

    async updateIcon(iconId, options) {
        await this._db.icons.update(iconId, options);
    }

    async fetchIcon(nodeId) {
        const icon = await this._db.icons.where("node_id").equals(nodeId).first();

        if (icon)
            return icon.data_url;

        return null;
    }

    cleanExportStorage() {
        return this._db.export_storage.clear();
    }

    putExportBlob(processId, blob) {
        return this._db.export_storage.add({
            process_id: processId,
            blob
        });
    }

    async getExportBlobs(processId) {
        const blobs = await this._db.export_storage.where("process_id").equals(processId).sortBy("id")
        return blobs.map(b => b.blob);
    }

    cleanExportBlobs(processId) {
        return this._db.export_storage.where("process_id").equals(processId).delete();
    }

}

export default BookmarkStorage;
