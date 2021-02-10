import IDBStorage from "./storage_idb.js"
import {rdfBackend} from "./backend_rdf.js"
import {cloudBackend} from "./backend_cloud.js"
import {browserBackend} from "./backend_browser.js"
import {delegateProxy} from "./utils.js";

import {
    DEFAULT_SHELF_NAME,
    DONE_NAME,
    EVERYTHING,
    NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_GROUP, NODE_TYPE_SEPARATOR, NODE_TYPE_SHELF,
    SPECIAL_UUIDS, TODO_NAME,
    isContainer,
    isEndpoint
} from "./storage_constants.js";

export class Backend {

    constructor(storageBackend) {
        this.externalBackends = {};

        this.registerExternalBackend("browser", browserBackend);
        this.registerExternalBackend("cloud", cloudBackend);
        this.registerExternalBackend("rdf", rdfBackend);

        return delegateProxy(this, storageBackend);
    }

    expandPath(path) {
        if (path && path.startsWith("~"))
            return path.replace("~", DEFAULT_SHELF_NAME);

        // the following values are got during reconciliation in browser backend and may vary
        // depending on browser UI language
        else if (path && path.startsWith("@@") && this._unfiledBookmarkPath)
            return path.replace("@@", this._unfiledBookmarkPath);
        else if (path && path.startsWith("@") && this._browserBookmarkPath)
            return path.replace("@", this._browserBookmarkPath);

        return path;
    }

    _normalizePath(path) {
        if (path) {
            path = path.trim();
            if (path.startsWith("/"))
                path = DEFAULT_SHELF_NAME + path;
            else if (!path)
                path = DEFAULT_SHELF_NAME;

            return path;
        }
        else
            return DEFAULT_SHELF_NAME;
    }

    _splitPath(path) {
        return this._normalizePath(path).split("/").filter(n => !!n);
    }

    _splitTags(tags, separator = ",") {
        if (tags && typeof tags === "string")
            return tags.split(separator)
                .filter(t => !!t)
                .map(t => t.trim())
                .map(t => t.toLocaleUpperCase());

        return tags;
    }

    blob2Array(blob) {
        let byteArray = new Uint8Array(blob.byte_length);
        for (let i = 0; i < blob.data.length; ++i)
            byteArray[i] = blob.data.charCodeAt(i);
        return byteArray;
    }

    listShelves() {
        return this.queryShelf()
    }

    async listShelfNodes(shelf) {
        let nodes = [];

        if (shelf === EVERYTHING)
            nodes = await this.getNodes();
        else {
            let shelf_node = await this.queryShelf(shelf);
            nodes = await this.queryFullSubtree(shelf_node.id);
        }

        if (nodes)
            nodes.sort((a, b) => a.pos - b.pos);

        return nodes;
    }

    listGroups() {
        return backend.queryGroups(true);
    }

    invalidateItemCache() {
    }

    async listNodes(options //{search, // filter by node name or URL
                      // path,   // filter by hierarchical node group path (string), the first item in the path is a name of a shelf
                      // tags,   // filter for node tags (string, containing comma separated list)
                      // types,  // filter for node types (array of integers)
                      // limit,  // limit for the returned record number
                      // depth,  // specify depth of search: "group", "subtree" or "root+subtree"
                      // order   // order mode to sort the output if specified: "custom", "todo"
                      // content // search in content instead of node name (boolean)
                      //}
              ) {
        let group = options.path && options.path !== TODO_NAME && options.path !== DONE_NAME
            ? await this._queryGroup(options.path)
            : null;

        if (!options.depth)
            options.depth = "subtree";

        if (options.tags)
            options.tags = this._splitTags(options.tags);

        let result;

        if (options.content && options.search) {
            let search = this._splitTags(options.search, /\s+/);
            delete options.search;
            result = await this.queryNodes(group, options);
            result = await this.filterByContent(result, search);
        }
        else
            result = await this.queryNodes(group, options);

        if (options.path && (options.path === TODO_NAME || options.path === DONE_NAME)) {
            for (let node of result) {
                node._extended_todo = true;
                let path = await this.computePath(node.id);

                node._path = [];
                for (let i = 0; i < path.length - 1; ++i) {
                    node._path.push(path[i].name)
                }
            }
        }

        return result;
    }

    async reorderNodes(positions) {
        try {
            await this.reorderExternalBookmarks(positions);
        }
        catch (e) {
            console.log(e);
        }
        return this.updateNodes(positions);
    }

    setTODOState(states) {
        return this.updateNodes(states);
    }

    async listTODO() {
        let todo = await this.queryTODO();
        todo.reverse();
        todo.sort((a, b) => a.todo_state - b.todo_state);


        let now = new Date();
        now.setUTCHours(0, 0, 0, 0);

        for (let node of todo) {
            let todo_date;

            if (node.todo_date && node.todo_date != "")
            try {
                todo_date = new Date(node.todo_date);
                todo_date.setUTCHours(0, 0, 0, 0);
            } catch (e) {
            }

            if (todo_date && now >= todo_date)
                node._overdue = true;

            let path = await this.computePath(node.id);

            node._path = [];
            for (let i = 0; i < path.length - 1; ++i) {
                node._path.push(path[i].name)
            }

            node._extended_todo = true;
        }

        return todo.filter(n => n._overdue).concat(todo.filter(n => !n._overdue));
    }

    async listDONE() {
        let done = await this.queryDONE();

        for (let node of done) {
            let path = await this.computePath(node.id);

            node._path = [];
            for (let i = 0; i < path.length - 1; ++i) {
                node._path.push(path[i].name)
            }

            node._extended_todo = true;
        }

        return done;
    }

    // returns map of groups the function was able to find in the path
    async _queryGroups(path_list) {
        path_list = path_list.slice(0);

        let groups = {};
        let shelf_name = path_list.shift();
        let shelf = await this.queryShelf(shelf_name);

        if (shelf)
            groups[shelf.name.toLowerCase()] = shelf;
        else
            return {};

        let parent = shelf;
        for (let name of path_list) {
            if (parent) {
                let group = await this.queryGroup(parent.id, name);
                groups[name.toLowerCase()] = group;
                parent = group;
            }
            else
                break;
        }

        return groups;
    }

    // returns the last group in path if it exists
    async _queryGroup(path) {
        let path_list = this._splitPath(path);
        let groups = await this._queryGroups(path_list);

        return groups[path_list[path_list.length - 1].toLowerCase()];
    }

    // creates all non-existent groups
    async getGroupByPath(path) {
        let path_list = this._splitPath(path);
        let groups = await this._queryGroups(path_list);
        let shelf_name = path_list.shift();
        let parent = groups[shelf_name.toLowerCase()];

        if (!parent) {
            parent = await this.addNode({
                name: shelf_name,
                type: NODE_TYPE_SHELF
            });
        }

        for (let name of path_list) {
            let group = groups[name.toLowerCase()];

            if (group) {
                parent = group;
            }
            else {
                let node = await this.addNode({
                    parent_id: parent.id,
                    name: name,
                    type: NODE_TYPE_GROUP
                });

                await this.createExternalBookmarkFolder(node, parent);

                parent = node;
            }
        }

        return parent;
    }

    async _ensureUnique(parent_id, name) {
        let children;

        if (parent_id)
            children = (await this.getChildNodes(parent_id)).map(c => c.name);
        else
            children = (await this.queryShelf()).map(c => c.name);

        let original = name;
        let n = 1;

        while (children.filter(c => !!c).some(c => c.toLocaleUpperCase() === name.toLocaleUpperCase())) {
            name = original + " (" + n + ")";
            n += 1
        }

        return name;
    }

    async createGroup(parent_id, name, node_type = NODE_TYPE_GROUP) {
        let {id} = await this.addNode({
            name: await this._ensureUnique(parent_id, name),
            type: node_type,
            parent_id: parent_id
        });

        let node = await this.getNode(id);

        if (parent_id) {
            let parent = await this.getNode(parent_id);
            await this.createExternalBookmarkFolder(node, parent);
        }

        return node;
    }

    async renameGroup(id, new_name) {
        let group = await this.getNode(id);

        if (group.name !== new_name) {
            if (group.name.toLocaleUpperCase() !== new_name.toLocaleUpperCase())
                group.name = await this._ensureUnique(group.parent_id, new_name);
            else
                group.name = new_name;

            await this.renameExternalBookmark(group);

            await this.updateNode(group);
        }
        return group;
    }

    async addSeparator(parent_id) {
        let {id} = await this.addNode({
            name: "-",
            type: NODE_TYPE_SEPARATOR,
            parent_id: parent_id
        });

        return this.getNode(id);
    }

    async moveNodes(ids, dest_id) {
        let nodes = await this.getNodes(ids);

        await this.moveExternalBookmarks(nodes, dest_id);

        for (let n of nodes) {
            n.parent_id = dest_id;
            n.name = await this._ensureUnique(dest_id, n.name);
        }

        await this.updateNodes(nodes);
        return this.queryFullSubtree(ids, false, true);
    }

    async copyNodes(ids, dest_id) {
        let all_nodes = await this.queryFullSubtree(ids, false, true);
        let new_nodes = [];

        for (let n of all_nodes) {
            let old_id = n.old_id = n.id;

            if (ids.some(id => id === old_id)) {
                n.parent_id = dest_id;
                n.name = await this._ensureUnique(dest_id, n.name);
            }
            else {
                let new_parent = new_nodes.find(nn => nn.old_id === n.parent_id);
                if (new_parent)
                    n.parent_id = new_parent.id;
            }

            delete n.id;
            delete n.date_modified;

            new_nodes.push(Object.assign(n, await this.addNode(n, false)));

            try {
                if (isEndpoint(n) && n.type !== NODE_TYPE_SEPARATOR) {
                    let notes = await this.fetchNotes(old_id);
                    if (notes) {
                        await this.storeNotesLowLevel(n.id, notes.content, notes.format);
                        notes = null;
                    }
                }

                if (n.type === NODE_TYPE_ARCHIVE) {
                    let blob = await this.fetchBlob(old_id);
                    if (blob) {
                        await this.storeBlobLowLevel(n.id, blob.data, blob.type, blob.byte_length);
                        blob = null;
                    }

                    let index = await this.fetchIndex(old_id);
                    if (index) {
                        await this.storeIndex(n.id, index.words);
                        index = null;
                    }
                }
            } catch (e) {
                console.log(e);
            }
        }

        let original_nodes = new_nodes.filter(n => ids.some(id => id === n.old_id));

        await this.copyExternalBookmarks(original_nodes, dest_id);

        return new_nodes;
    }

    async deleteNodes(ids) {
        let all_nodes = await this.queryFullSubtree(ids);

        await this.deleteExternalBookmarks(all_nodes);

        return this.deleteNodesLowLevel(all_nodes.map(n => n.id));
    }

    async deleteChildNodes(id) {
        let all_nodes = await this.queryFullSubtree(id);

        return this.deleteNodesLowLevel(all_nodes.map(n => n.id).filter(i => i !== id));
    }

    async traverse(root, visitor) {
        let doTraverse = async (parent, root) => {
            await visitor(parent, root);
            let children = isContainer(root)
                ? await this.getChildNodes(root.id)
                : null;
            if (children)
                for (let c of children)
                    await doTraverse(root, c);
        };

        return doTraverse(null, root);
    }

    async addBookmark(data, node_type = NODE_TYPE_BOOKMARK) {
        let group, parent_id;

        if (data.parent_id) {
            parent_id = data.parent_id = parseInt(data.parent_id);
        }
        else {
            group = await this.getGroupByPath(data.path);
            parent_id = data.parent_id = group.id;
            delete data.path;
        }

        if (!group)
            group = await this.getNode(parent_id);

        data.name = await this._ensureUnique(data.parent_id, data.name);

        data.type = node_type;
        data.tag_list = this._splitTags(data.tags);
        this.addTags(data.tag_list);

        let node = await this.addNode(data);

        await this.createExternalBookmark(group, node);

        return node;
    }

    async importBookmark(data) {
        if (data.uuid === "1")
            return;

        if (data.type !== NODE_TYPE_SHELF)
            data.parent_id = data.parent_id? data.parent_id: (await this.getGroupByPath(data.path)).id;

        data = Object.assign({}, data);
        data.name = await this._ensureUnique(data.parent_id, data.name);

        data.tag_list = this._splitTags(data.tags);
        this.addTags(data.tag_list);

        let force_new_uuid = data.uuid
            && ((await this.isNodeExists(data.uuid)) || SPECIAL_UUIDS.some(uuid => uuid === data.uuid));

        return this.addNode(data, false,false,!data.uuid || force_new_uuid);
    }

    async updateBookmark(data) {
        let update = {};
        Object.assign(update, data);

        update.tag_list = this._splitTags(update.tags);
        this.addTags(update.tag_list);

        await this.updateExternalBookmark(update);

        return this.updateNode(update);
    }

    async storeBlob(node_id, data, content_type) {
        await this.storeBlobLowLevel(node_id, data, content_type);

        await this.storeExternalData(node_id, data, content_type)
    }

    async storeNotes(node_id, notes, format) {
        await this.storeNotesLowLevel(node_id, notes, format);

        await this.storeExternalNotes(node_id, notes, format);
    }

    registerExternalBackend(name, backend) {
        this.externalBackends[name] = backend;
    }

    unregisterExternalBackend(name) {
        delete this.externalBackends[name];
    }

    async reorderExternalBookmarks(positions) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.reorderBookmarks)
                await backend.reorderBookmarks(positions)
        }
    }

    async createExternalBookmarkFolder(node, parent) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.createBookmarkFolder)
                await backend.createBookmarkFolder(node, parent)
        }
    }

    async createExternalBookmark(parent, node) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.createBookmark)
                await backend.createBookmark(parent, node)
        }
    }

    async renameExternalBookmark(node) {
        for (let backend of Object.values(this.externalBackends)) {
            if (await backend.renameBookmark)
                await backend.renameBookmark(node)
        }
    }

    async moveExternalBookmarks(nodes, dest_id) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.moveBookmarks)
                await backend.moveBookmarks(nodes, dest_id)
        }
    }

    async copyExternalBookmarks(nodes, dest_id) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.copyBookmarks)
                await backend.copyBookmarks(nodes, dest_id)
        }
    }

    async deleteExternalBookmarks(nodes) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.deleteBookmarks)
                await backend.deleteBookmarks(nodes)
        }
    }

    async updateExternalBookmark(node) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.updateBookmark)
                await backend.updateBookmark(node)
        }
    }

    async storeExternalData(node_id, data, content_type) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.storeBookmarkData)
                await backend.storeBookmarkData(node_id, data, content_type);
        }
    }

    async storeExternalNotes(node_id, notes, format) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.storeBookmarkNotes)
                await backend.storeBookmarkNotes(node_id, notes, format);
        }
    }
}

export let backend = new Backend(new IDBStorage());
