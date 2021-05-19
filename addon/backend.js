import {delegateProxy} from "./proxy.js";
import IDBStorage from "./storage_idb.js";
import {rdfBackend} from "./backend_rdf.js";
import {cloudBackend} from "./backend_cloud.js";
import {browserBackend} from "./backend_browser.js";
import {computeSHA1, getMimetypeExt} from "./utils.js";
import {ishellBackend} from "./backend_ishell.js";

import {
    CLOUD_SHELF_ID, DEFAULT_POSITION,
    DEFAULT_SHELF_NAME,
    DONE_SHELF_NAME,
    EVERYTHING,
    EVERYTHING_SHELF_ID,
    FIREFOX_SHELF_ID,
    isContainer,
    isEndpoint,
    isSpecialShelf,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP,
    NODE_TYPE_NOTES,
    NODE_TYPE_SEPARATOR,
    NODE_TYPE_SHELF,
    SPECIAL_UUIDS,
    TODO_SHELF_NAME
} from "./storage_constants.js";
import {readBlob} from "./utils_io.js";
import {settings} from "./settings.js";

class ExternalEventProvider {
    constructor() {
        this.externalBackends = {};
    }

    registerExternalBackend(name, backend) {
        this.externalBackends[name] = backend;
    }

    unregisterExternalBackend(name) {
        delete this.externalBackends[name];
    }

    async createExternalBookmarkFolder(node, parent) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.createBookmarkFolder)
                await backend.createBookmarkFolder(node, parent);
        }
    }

    async createExternalBookmark(node, parent) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.createBookmark)
                await backend.createBookmark(node, parent);
        }
    }

    async renameExternalBookmark(node) {
        for (let backend of Object.values(this.externalBackends)) {
            if (await backend.renameBookmark)
                await backend.renameBookmark(node);
        }
    }

    async moveExternalBookmarks(nodes, dest_id) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.moveBookmarks)
                await backend.moveBookmarks(nodes, dest_id);
        }
    }

    async copyExternalBookmarks(nodes, dest_id) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.copyBookmarks)
                await backend.copyBookmarks(nodes, dest_id);
        }
    }

    async deleteExternalBookmarks(nodes) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.deleteBookmarks)
                await backend.deleteBookmarks(nodes);
        }
    }

    async updateExternalBookmark(node) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.updateBookmark)
                await backend.updateBookmark(node);
        }
    }

    async updateExternalBookmarks(nodes) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.updateBookmarks)
                await backend.updateBookmarks(nodes);
        }
    }

    async reorderExternalBookmarks(positions) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.reorderBookmarks)
                await backend.reorderBookmarks(positions);
        }
    }

    async storeExternalData(node_id, data, content_type) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.storeBookmarkData)
                await backend.storeBookmarkData(node_id, data, content_type);
        }
    }

    async updateExternalData(node_id, data) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.updateBookmarkData)
                await backend.updateBookmarkData(node_id, data);
        }
    }

    async storeExternalNotes(options) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.storeBookmarkNotes)
                await backend.storeBookmarkNotes(options);
        }
    }

    async storeExternalComments(node_id, comments) {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.storeBookmarkComments)
                await backend.storeBookmarkComments(node_id, comments);
        }
    }

    invalidateExternalCompletion() {
        for (let backend of Object.values(this.externalBackends)) {
            if (backend.invalidateCompletion)
                backend.invalidateCompletion();
        }
    }
}

export class Backend extends ExternalEventProvider {

    constructor(storageBackend) {
        super();

        this.registerExternalBackend("browser", browserBackend);
        this.registerExternalBackend("cloud", cloudBackend);
        this.registerExternalBackend("rdf", rdfBackend);
        this.registerExternalBackend("ishell", ishellBackend);

        return delegateProxy(this, storageBackend);
    }

    expandPath(path) {
        let background = browser.extension.getBackgroundPage();

        if (path && path.startsWith("~"))
            return path.replace("~", DEFAULT_SHELF_NAME);
        // the following values are got during reconciliation in browser backend and may vary
        // depending on browser UI language
        else if (path && path.startsWith("@@") && background._unfiledBookmarkPath)
            return path.replace("@@", background._unfiledBookmarkPath);
        else if (path && path.startsWith("@") && background._browserBookmarkPath)
            return path.replace("@", background._browserBookmarkPath);

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

    _splitTags(tags, separator = ",") {
        if (tags && typeof tags === "string")
            return tags.split(separator)
                .filter(t => !!t)
                .map(t => t.trim())
                .map(t => t.toLocaleUpperCase());

        return tags;
    }

    _blob2Array(blob) {
        let byteArray = new Uint8Array(blob.byte_length);
        for (let i = 0; i < blob.data.length; ++i)
            byteArray[i] = blob.data.charCodeAt(i);
        return byteArray;
    }

    async reifyBlob(blob, binarystring = false) {
        let result;

        if (!blob)
            return null;

        if (blob.byte_length) {
            if (blob.data) {
                if (binarystring)
                    result = blob.data;
                else
                    result = this._blob2Array(blob);
            }
            else if (blob.object) {
                if (binarystring)
                    result = await readBlob(blob.object, "binarystring")
                else
                    result = await readBlob(blob.object, "binary")
            }
        }
        else {
            if (blob.data)
                result = blob.data;
            else if (blob.object)
                result = await readBlob(blob.object, "text");
        }

        return result;
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

    async listNodes(options //{search, // filter by node name or URL
                      // path,   // filter by hierarchical node group path (string), the first item in the path is a name of a shelf
                      // tags,   // filter for node tags (string, containing comma separated list)
                      // date,   // filter nodes by date
                      // date2,  // the second date in query
                      // period, // chronological period: "" (exact date), "before", "after"
                      // types,  // filter for node types (array of integers)
                      // limit,  // limit for the returned record number
                      // depth,  // specify depth of search: "group", "subtree" or "root+subtree"
                      // order   // order mode to sort the output if specified: "custom", "todo"
                      // content // search in content instead of node name (boolean)
                      // index   // index to use: "content", "comments", "notes"
                      //}
              ) {
        let group = options.path && options.path !== TODO_SHELF_NAME && options.path !== DONE_SHELF_NAME
            ? await this._queryGroup(options.path)
            : null;

        if (!options.depth)
            options.depth = "subtree";

        if (options.tags)
            options.tags = this._splitTags(options.tags);

        let result;

        if (options.content && options.search) {
            const search = options.search.indexWords();

            let subtree;
            if (options.path) {
                subtree = [];

                if (options.path.toLowerCase() === EVERYTHING)
                    subtree = null;
                else if (options.path.toUpperCase() === TODO_SHELF_NAME)
                    subtree = (await this.queryTODO()).map(n => n.id);
                else if (options.path.toUpperCase() === DONE_SHELF_NAME)
                    subtree = (await this.queryDONE()).map(n => n.id);
                else
                    await this._selectAllChildrenIdsOf(group.id, subtree);
            }

            result = await this.filterByContent(subtree, search, options.index);
        }
        else {
            result = await this.queryNodes(group, options);
        }

        if (options.path && (options.path.toUpperCase() === TODO_SHELF_NAME
            || options.path.toUpperCase() === DONE_SHELF_NAME)) {
            for (let node of result) {
                node._extended_todo = true;
                let path = await this.computePath(node.id);

                node._path = [];
                for (let i = 0; i < path.length - 1; ++i) {
                    node._path.push(path[i].name)
                }
            }
        }

        result.forEach(n => n.__filtering = true);

        return result;
    }

    async reorderNodes(positions) {
        try {
            await this.reorderExternalBookmarks(positions);
        }
        catch (e) {
            console.error(e);
        }
        return this.updateNodes(positions);
    }

    async setTODOState(states) {
        await this.updateNodes(states);
        return this.updateExternalBookmarks(states);
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
            groups[shelf.name.toLocaleLowerCase()] = shelf;
        else
            return {};

        let parent = shelf;
        for (let name of path_list) {
            if (parent) {
                let group = await this.queryGroup(parent.id, name);
                groups[name.toLocaleLowerCase()] = group;
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

        return groups[path_list[path_list.length - 1].toLocaleLowerCase()];
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
            this.invalidateExternalCompletion();
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
                this.invalidateExternalCompletion();

                parent = node;
            }
        }

        return parent;
    }

    async _ensureUnique(parent_id, name) {
        if (!name)
            return "";

        let children;

        if (parent_id)
            children = (await this.getChildNodes(parent_id)).map(c => c.name);
        else
            children = (await this.queryShelf()).map(c => c.name);

        let original = name;
        let n = 1;

        while (children.filter(c => !!c).some(c => c.toLocaleUpperCase() === name.toLocaleUpperCase())) {
            let m = original.match(/.*( \(\d+\))$/);

            if (m)
                original = original.replace(m[1], "");

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

        this.invalidateExternalCompletion();

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

            this.invalidateExternalCompletion();

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

    async moveNodes(ids, dest_id, move_last) {
        let nodes = await this.getNodes(ids);

        await this.moveExternalBookmarks(nodes, dest_id);

        for (let n of nodes) {
            n.parent_id = dest_id;
            n.name = await this._ensureUnique(dest_id, n.name);

            if (move_last)
                n.pos = DEFAULT_POSITION;

            await this.updateNode(n);
        }

        if (nodes.some(n => n.type === NODE_TYPE_GROUP))
            this.invalidateExternalCompletion();

        return this.queryFullSubtree(ids, false, true);
    }

    async copyNodes(ids, dest_id, move_last) {
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

            if (move_last && ids.some(id => id === n.old_id))
                n.pos = DEFAULT_POSITION;

            new_nodes.push(Object.assign(n, await this.addNode(n, false)));

            try {
                if (isEndpoint(n) && n.type !== NODE_TYPE_SEPARATOR) {
                    let notes = await this.fetchNotes(old_id);
                    if (notes) {
                        delete notes.id;
                        notes.node_id = n.id;
                        await this.storeNotesLowLevel(notes);
                        notes = null;
                    }

                    let comments = await this.fetchComments(old_id);
                    if (comments) {
                        await this.storeCommentsLowLevel(n.id, comments);
                        comments = null;
                    }

                    if (n.stored_icon) {
                        let icon = await this.fetchIcon(old_id);
                        if (icon) {
                            await this.storeIconLowLevel(n.id, icon);
                        }
                    }
                }

                if (n.type === NODE_TYPE_ARCHIVE) {
                    let blob = await this.fetchBlob(old_id);
                    if (blob) {
                        let index = await this.fetchIndex(old_id);
                        await this.storeBlobLowLevel(n.id, blob.data || blob.object, blob.type, blob.byte_length, index);
                        blob = null;
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }

        let top_nodes = new_nodes.filter(n => ids.some(id => id === n.old_id));

        await this.copyExternalBookmarks(top_nodes, dest_id);

        if (top_nodes.some(n => n.type === NODE_TYPE_GROUP))
            this.invalidateExternalCompletion();

        return new_nodes;
    }

    async deleteNodes(ids) {
        let all_nodes = await this.queryFullSubtree(ids);

        await this.deleteExternalBookmarks(all_nodes);

        await this.deleteNodesLowLevel(all_nodes.map(n => n.id));

        if (all_nodes.some(n => n.type === NODE_TYPE_GROUP || n.type === NODE_TYPE_SHELF))
            this.invalidateExternalCompletion();
    }

    async deleteChildNodes(id) {
        let all_nodes = await this.queryFullSubtree(id);

        await this.deleteNodesLowLevel(all_nodes.map(n => n.id).filter(i => i !== id));

        this.invalidateExternalCompletion();
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

    async storeIcon(node, iconData, contentType) {
        const convertAndStore = async (iconData, contentType) => {
            if (iconData.byteLength && contentType && contentType.startsWith("image")) {
                const byteArray = new Uint8Array(iconData);

                let binaryString = "";
                for (let i = 0; i < byteArray.byteLength; i++)
                    binaryString += String.fromCharCode(byteArray[i]);

                contentType = contentType.split(";")[0];

                let iconUrl = `data:${contentType};base64,${btoa(binaryString)}`;

                const id = await this.storeIconLowLevel(node.id, iconUrl);

                return [id, iconUrl];
            }
        };

        const updateNode = async (node, iconUrl) => {
            node.stored_icon = true;
            node.icon = "hash:" + (await computeSHA1(iconUrl));
            if (node.id)
                await this.updateNode(node);
        };

        if (node.icon) {
            try {
                if (node.icon.startsWith("data:")) {
                    const id = await this.storeIconLowLevel(node.id, node.icon);
                    await updateNode(node, node.icon);
                    return id;
                }
                else {
                    if (iconData && contentType) {
                        const [id, iconUrl] = await convertAndStore(iconData, contentType);
                        await updateNode(node, iconUrl);
                        return id;
                    }
                    else {
                        try {
                            const response = await fetch(node.icon);

                            if (response.ok) {
                                let type = response.headers.get("content-type");

                                if (!type) {
                                    let iconUrl = new URL(node.icon);
                                    type = getMimetypeExt(iconUrl.pathname);
                                }

                                if (type.startsWith("image")) {
                                    const buffer = await response.arrayBuffer();
                                    if (buffer.byteLength) {
                                        const [id, iconUrl] = await convertAndStore(buffer, type);
                                        await updateNode(node, iconUrl);
                                        return id;
                                    }
                                }
                            }
                        }
                        catch (e) {
                            node.icon = null;
                            node.stored_icon = false;
                            if (node.id)
                                await this.updateNode(node);
                            console.error(e);
                        }
                    }
                }
            }
            catch (e) {
                console.error(e);
            }
        }
    }

    setTentativeId(node) {
        const id = "tentative_" + Math.floor(Math.random() * 1000);
        node.__tentative_id = id;
    }

    async addBookmark(data, node_type = NODE_TYPE_BOOKMARK) {
        let group, parent_id;

        if (data.parent_id)
            parent_id = data.parent_id = parseInt(data.parent_id);
        else
            throw new Error("No bookmark parent id");

        if (!group)
            group = await this.getNode(parent_id);

        data.name = await this._ensureUnique(data.parent_id, data.name);

        data.type = node_type;
        data.tag_list = this._splitTags(data.tags);
        await this.addTags(data.tag_list);

        const icon_id = await this.storeIcon(data);
        const node = await this.addNode(data);

        if (icon_id)
            await this.updateIcon(icon_id, {node_id: node.id});

        await this.createExternalBookmark(node, group);

        return node;
    }

    async importBookmark(data) {
        if (data.uuid === "1")
            return;

        if (data.type !== NODE_TYPE_SHELF)
            data.parent_id = data.parent_id || (await this.getGroupByPath(data.path)).id;

        data = Object.assign({}, data);
        data.name = await this._ensureUnique(data.parent_id, data.name);

        data.tag_list = this._splitTags(data.tags);
        this.addTags(data.tag_list);

        let force_new_uuid = data.uuid
            && ((await this.isNodeExists(data.uuid)) || SPECIAL_UUIDS.some(uuid => uuid === data.uuid));

        if (!data.date_added || !data.date_modified) {
            const now = new Date();

            if (!data.date_added)
                data.date_added = now;

            if (!data.date_modified)
                data.date_modified = now;
        }

        return this.addNode(data, false, false, !data.uuid || force_new_uuid);
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

        await this.storeExternalData(node_id, data, content_type);
    }

    async updateBlob(node_id, data) {
        await this.updateBlobLowLevel(node_id, data);

        await this.updateExternalData(node_id, data);
    }

    async addNotes(parent_id, name) {
        let node = await this.addNode({
            parent_id: parent_id,
            name: name,
            //has_notes: true,
            type: NODE_TYPE_NOTES
        });

        let group = await this.getNode(parent_id);

        await this.createExternalBookmark(node, group);

        return node;
    }

    async storeNotes(options) {
        await this.storeNotesLowLevel(options);

        await this.storeExternalNotes(options);
    }

    async storeComments(node_id, comments) {
        await this.storeCommentsLowLevel(node_id, comments);

        await this.storeExternalComments(node_id, comments);
    }
}

export let backend = new Backend(new IDBStorage());

export function formatShelfName(name) {
    return settings.capitalize_builtin_shelf_names() ? name?.capitalize() : name;
}

export async function loadShelfListOptions(element) {
    $(element).html(`<option value="${EVERYTHING_SHELF_ID}">${formatShelfName(EVERYTHING)}</option>`);

    let shelves = await backend.listShelves();
    shelves.sort((a, b) => {
        if (a.name < b.name)
            return -1;
        if (a.name > b.name)
            return 1;

        return 0;
    });

    let cloud_shelf = shelves.find(s => s.id === CLOUD_SHELF_ID);
    if (cloud_shelf)
        shelves.splice(shelves.indexOf(cloud_shelf), 1);

    let browser_bookmarks_shelf = shelves.find(s => s.id === FIREFOX_SHELF_ID);
    if (browser_bookmarks_shelf)
        shelves.splice(shelves.indexOf(browser_bookmarks_shelf), 1);

    const builtin_shelves = [];

    if (cloud_shelf)
        builtin_shelves.push(cloud_shelf);

    if (browser_bookmarks_shelf)
        builtin_shelves.push(browser_bookmarks_shelf);

    let default_shelf = shelves.find(s => s.name.toLowerCase() === DEFAULT_SHELF_NAME);
    shelves.splice(shelves.indexOf(default_shelf), 1);

    shelves = [...builtin_shelves, default_shelf, ...shelves];

    for (let shelf of shelves) {
        let name = isSpecialShelf(shelf.name) ? formatShelfName(shelf.name) : shelf.name;
        $("<option></option>").appendTo($(element)).html(name).attr("value", shelf.id);
    }
}
