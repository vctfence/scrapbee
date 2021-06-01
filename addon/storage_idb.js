import {
    isContainer,
    CLOUD_SHELF_ID,
    DEFAULT_POSITION,
    DEFAULT_SHELF_ID,
    DEFAULT_SHELF_NAME,
    DEFAULT_SHELF_UUID,
    DONE_SHELF_NAME,
    FIREFOX_SHELF_ID,
    NODE_PROPERTIES,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    TODO_SHELF_NAME,
    TODO_STATE_DONE,
    NODE_TYPE_UNLISTED
} from "./storage.js";

import UUID from "./lib/uuid.js"
import Dexie from "./lib/dexie.js"
import {stringByteLengthUTF8} from "./utils.js";
import {notes2html} from "./notes_render.js";
import {indexWords} from "./utils_html.js";


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

    async _IdFromUUID(uuid) {
        let node = await dexie.nodes.where("uuid").equals(uuid).first();
        return node?.id;
    }

    nodeTransaction(mode, operation) {
        return dexie.transaction(mode, dexie.nodes, operation);
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

        datum.id = await dexie.nodes.add(this._sanitizeNode(datum));
        return datum;
    }

    isNodeExists(uuid) {
        if (!uuid)
            return false;

        return dexie.nodes.where("uuid").equals(uuid).count();
    }

    async getNode(id, isUUID = false) {
        if (isUUID)
            return dexie.nodes.where("uuid").equals(id).first();
        else
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

    getExternalNode(externalId, kind) {
        return dexie.nodes.where("external_id").equals(externalId).and(n => n.external === kind).first();
    }

    getExternalNodes(kind) {
        return dexie.nodes.where("external").equals(kind).toArray();
    }

    async isExternalNodeExists(externalId, kind) {
        return !!(await dexie.nodes.where("external_id").equals(externalId).and(n => n.external === kind).count());
    }

    async deleteExternalNodes(kind) {
        const ids = [];
        await dexie.nodes.where("external").equals(kind).each(n => ids.push(n.id));
        return this.deleteNodesLowLevel(ids);
    }

    async deleteMissingExternalNodes(externalIds, kind) {
        const existing = new Set(externalIds);

        const ids = [];
        await dexie.nodes.where("external").equals(kind)
            .and(n => n.external_id && !existing.has(n.external_id))
            .each(n => ids.push(n.id));

        return this.deleteNodesLowLevel(ids);
    }

    getChildNodes(id) {
        return dexie.nodes.where("parent_id").equals(id).toArray();
    }

    async updateNodes(nodes, ids) {
        if (typeof nodes === "function") {
            const postprocess = node => {
                nodes(node)
                node.date_modified = new Date();
                this._sanitizeNode(node);
            };

            if (ids)
                dexie.nodes.where("id").anyOf(ids).modify(postprocess)
            else
                await dexie.nodes.toCollection().modify(postprocess);
        }
        else {
            for (let node of nodes) {
                node.date_modified = new Date();
                await dexie.nodes.where("id").equals(node.id).modify(this._sanitizeNode(node));
            }
        }
    }

    async updateNode(node, resetDate = true) {
        if (node?.id) {
            if (resetDate)
                node.date_modified = new Date();
            await dexie.nodes.update(node.id, this._sanitizeNode(node));
        }
        return node;
    }

    iterateNodes(iterator, filter) {
        if (filter)
            return dexie.nodes.filter(filter).each(iterator);
        else
            return dexie.nodes.each(iterator);
    }

    filterNodes(filter) {
        return dexie.nodes.filter(filter).toArray();
    }

    async _selectDirectChildrenIdsOf(id, children) {
        await dexie.nodes.where("parent_id").equals(id).each(n => children.push(n.id));
    }

    async _selectAllChildrenIdsOf(id, children) {
        let directChildren = [];
        await dexie.nodes.where("parent_id").equals(id)
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
        let directChildren = await dexie.nodes.where("parent_id").equals(node.id).toArray();

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
        let query = dexie.nodes;

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

    queryTODO() {
        return dexie.nodes.where("todo_state").below(TODO_STATE_DONE).toArray();
    }

    queryDONE() {
        return dexie.nodes.where("todo_state").aboveOrEqual(TODO_STATE_DONE).toArray();
    }

    // returns nodes containing only the all given words
    async filterByContent(ids, words, index) {
        let matches = {};
        let allMatchedNodes = [];
        let wordCount = {};

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
        const retain = [DEFAULT_SHELF_ID, FIREFOX_SHELF_ID, CLOUD_SHELF_ID,
            ...(await this.queryFullSubtree(FIREFOX_SHELF_ID, true)),
            ...(await this.queryFullSubtree(CLOUD_SHELF_ID, true))];

        if (dexie.tables.some(t => t.name === "blobs"))
            await dexie.blobs.where("node_id").noneOf(retain).delete();

        if (dexie.tables.some(t => t.name === "index"))
            await dexie.index.where("node_id").noneOf(retain).delete();

        if (dexie.tables.some(t => t.name === "notes"))
            await dexie.notes.where("node_id").noneOf(retain).delete();

        if (dexie.tables.some(t => t.name === "icons"))
            await dexie.icons.where("node_id").noneOf(retain).delete();

        if (dexie.tables.some(t => t.name === "comments"))
            await dexie.comments.where("node_id").noneOf(retain).delete();

        if (dexie.tables.some(t => t.name === "index_notes"))
            await dexie.index_notes.where("node_id").noneOf(retain).delete();

        if (dexie.tables.some(t => t.name === "index_comments"))
            await dexie.index_comments.where("node_id").noneOf(retain).delete();

        if (dexie.tables.some(t => t.name === "tags"))
            await dexie.tags.clear();

        return dexie.nodes.where("id").noneOf(retain).delete();
    }

    async queryShelf(name) {
        let where = dexie.nodes.where("type").equals(NODE_TYPE_SHELF).and(n => !n.parent_id);

        if (name) {
            name = name.toLocaleUpperCase();
            return await where.and(n => name === n.name.toLocaleUpperCase()).first();
        }
        else
            return await where.toArray();
    }

    async queryUnlisted(name) {
        let where = dexie.nodes.where("type").equals(NODE_TYPE_UNLISTED);

        if (name) {
            name = name.toLocaleUpperCase();
            return await where.and(n => name === n.name.toLocaleUpperCase()).first();
        }
        else
            return await where.toArray();
    }

    queryGroup(parentId, name) {
        name = name.toLocaleUpperCase();
        return dexie.nodes.where("parent_id").equals(parentId)
           .and(n => name === n.name.toLocaleUpperCase())
           .first();
    }

    async queryGroups(sort = false) {
        const nodes = await dexie.nodes.where("type").anyOf([NODE_TYPE_SHELF, NODE_TYPE_GROUP]).toArray();

        if (sort)
            return nodes.sort((a, b) => a.pos - b.pos);

        return nodes;
    }

    // at first all objects were stored as plain strings
    // legacy implementation for the reference
    // async storeBlobLowLevel(node_id, data, content_type, byte_length, index) {
    //     let node = await this.getNode(node_id);
    //
    //     if (node) {
    //         if (typeof data !== "string") {
    //             let binaryString = "";
    //             let byteArray = new Uint8Array(data);
    //
    //             for (let i = 0; i < byteArray.byteLength; i++)
    //                 binaryString += String.fromCharCode(byteArray[i]);
    //
    //             node.size = byte_length = byteArray.byteLength;
    //             data = binaryString;
    //         }
    //         else
    //             node.size = stringByteLengthUTF8(data);
    //
    //         await this.updateNode(node);
    //
    //         await dexie.blobs.add({
    //             node_id: node.id,
    //             data: data,
    //             byte_length: byte_length,
    //             type: content_type
    //         });
    //
    //         if (!byte_length && typeof data === "string") {
    //             if (index?.words)
    //                 await this.storeIndex(node.id, index.words);
    //             else {
    //                 let words = data.indexWords();
    //                 await this.storeIndex(node.id, words);
    //             }
    //         }
    //     }
    // }

    // modern implementation stores objects in blobs
    async storeBlobLowLevel(nodeId, data, contentType, byteLength, index) {
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

        await dexie.blobs.add(options);

        const node = {id: nodeId, size: object.size, content_type: contentType};
        await this.updateNode(node);

        if (index?.words)
            await this.storeIndex(node.id, index.words);
        else if (!byteLength && typeof data === "string")
            await this.storeIndex(node.id, indexWords(data));
    }

    // used only for text/html edited content
    async updateBlobLowLevel(nodeId, data) {
        const object = new Blob([data], {type: "text/html"});

        await dexie.blobs.where("node_id").equals(nodeId).modify({
            object,
            data: undefined // undefined removes fields from IDB
        });

        const node = {id: nodeId, size: object.size};
        await this.updateNode(node);
        await this.updateIndex(nodeId, indexWords(data));
    }

    async deleteBlob(nodeId) {
        if (dexie.tables.some(t => t.name === "blobs"))
            await dexie.blobs.where("node_id").equals(nodeId).delete();

        if (dexie.tables.some(t => t.name === "index"))
            await dexie.index.where("node_id").equals(nodeId).delete();
    }

    async fetchBlob(nodeId, isUUID = false) {
        nodeId = isUUID? await this._IdFromUUID(nodeId): nodeId;
        return dexie.blobs.where("node_id").equals(nodeId).first();
    }

    async storeIndex(nodeId, words) {
        return dexie.index.add({
            node_id: nodeId,
            words: words
        });
    }

    async updateIndex(nodeId, words) {
        const exists = await dexie.index.where("node_id").equals(nodeId).count();

        if (exists)
            return dexie.index.where("node_id").equals(nodeId).modify({
                words: words
            });
        else
            return this.storeIndex(nodeId, words);
    }

    async fetchIndex(nodeId, isUUID = false) {
        nodeId = isUUID? await this._IdFromUUID(nodeId): nodeId;
        return dexie.index.where("node_id").equals(nodeId).first();
    }

    async storeNotesLowLevel(options) {
        const exists = await dexie.notes.where("node_id").equals(options.node_id).count();

        if (exists) {
            await dexie.notes.where("node_id").equals(options.node_id).modify(options);
        }
        else {
            await dexie.notes.add(options);
        }

        const node = {id: options.node_id, has_notes: !!options.content};

        if (node.has_notes) {
            let words;
            node.size = stringByteLengthUTF8(options.content);

            if (options.format === "delta" && options.html) {
                node.size += stringByteLengthUTF8(options.html);
                words = indexWords(options.html);
            }
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
                await this.updateNoteIndex(node.id, words);
            else
                await this.updateNoteIndex(node.id, []);
        }
        else {
            node.size = undefined;
            await this.updateNoteIndex(node.id, []);
        }

        await this.updateNode(node);
    }

    async fetchNotes(nodeId, isUUID = false) {
        nodeId = isUUID? await this._IdFromUUID(nodeId): nodeId;
        return dexie.notes.where("node_id").equals(nodeId).first();
    }

    async updateNoteIndex(nodeId, words) {
        const exists = await dexie.index_notes.where("node_id").equals(nodeId).count();

        if (exists)
            return dexie.index_notes.where("node_id").equals(nodeId).modify({
                words: words
            });
        else
            return dexie.index_notes.add({
                node_id: nodeId,
                words: words
            });
    }

    async storeCommentsLowLevel(nodeId, comments) {
        const exists = await dexie.comments.where("node_id").equals(nodeId).count();

        if (!comments)
            comments = undefined;

        if (exists) {
            await dexie.comments.where("node_id").equals(nodeId).modify({
                comments: comments
            });
        }
        else {
            await dexie.comments.add({
                node_id: nodeId,
                comments: comments
            });
        }

        const node = {id: nodeId, has_comments: !!comments};
        await this.updateNode(node);

        if (node.has_comments) {
            let words = indexWords(comments, false);
            await this.updateCommentIndex(node.id, words);
        }
        else
            await this.updateCommentIndex(node.id, []);
    }

    async fetchComments(nodeId, isUUID = false) {
        nodeId = isUUID? await this._IdFromUUID(nodeId): nodeId;

        let record = await dexie.comments.where("node_id").equals(nodeId).first();

        return record?.comments;
    }

    async updateCommentIndex(nodeId, words) {
        let exists = await dexie.index_comments.where("node_id").equals(nodeId).count();

        if (exists)
            return dexie.index_comments.where("node_id").equals(nodeId).modify({
                words: words
            });
        else
            return dexie.index_comments.add({
                node_id: nodeId,
                words: words
            });
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

    async storeIconLowLevel(nodeId, dataUrl) {
        const exists = nodeId? await dexie.icons.where("node_id").equals(nodeId).count(): false;

        if (exists) {
            await dexie.icons.where("node_id").equals(nodeId).modify({
                data_url: dataUrl
            });
        }
        else {
            return await dexie.icons.add({
                node_id: nodeId,
                data_url: dataUrl
            });
        }
    }

    async updateIcon(iconId, options) {
        await dexie.icons.update(iconId, options);
    }

    async fetchIcon(nodeId) {
        const icon = await dexie.icons.where("node_id").equals(nodeId).first();

        if (icon)
            return icon.data_url;

        return null;
    }

    cleanExportStorage() {
        return dexie.export_storage.clear();
    }

    putExportBlob(processId, blob) {
        return dexie.export_storage.add({
            process_id: processId,
            blob
        });
    }

    async getExportBlobs(processId) {
        const blobs = await dexie.export_storage.where("process_id").equals(processId).sortBy("id")
        return blobs.map(b => b.blob);
    }

    cleanExportBlobs(processId) {
        return dexie.export_storage.where("process_id").equals(processId).delete();
    }

}

export default IDBStorage;
