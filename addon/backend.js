import {settings} from "./settings.js"

import {
    ENDPOINT_TYPES,
    CONTAINER_TYPES,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    NODE_TYPE_SEPARATOR,
    DEFAULT_SHELF_NAME,
    TODO_NAME,
    DONE_NAME,
    FIREFOX_SHELF_ID, FIREFOX_SHELF_NAME, FIREFOX_SHELF_UUID,
    isContainer, isEndpoint
} from "./db.js"

import Storage from "./db.js"
import {getFavicon} from "./utils.js";

let backend;
let browserBackend;

export class BrowserBackend {

    constructor() {
        this._browserListenerOnBookmarkCreated = this.onBookmarkCreated.bind(this);
        this._browserListenerOnBookmarkRemoved = this.onBookmarkRemoved.bind(this);
        this._browserListenerOnBookmarkChanged = this.onBookmarkChanged.bind(this);
        this._browserListenerOnBookmarkMoved = this.onBookmarkMoved.bind(this);
        this._listenersInstalled = false;

        this._uiSemaphore = 0;
        this._listenerSemaphore = 0;
    }

    async traverse (root, visitor) {
        let doTraverse = async (parent, root) => {
            await visitor(parent, root);
            let children = isContainer(root)
                ? await backend.getChildNodes(root.id)
                : null;
            if (children)
                for (let c of children)
                    await doTraverse(root, c);
        };

        return doTraverse(null, root);
    }

    newBrowserRootNode() {
        return {id: FIREFOX_SHELF_ID,
                pos: -1,
                icon: "/icons/firefox.svg",
                name: FIREFOX_SHELF_NAME,
                uuid: FIREFOX_SHELF_UUID,
                type: NODE_TYPE_SHELF,
                external: FIREFOX_SHELF_NAME};
    }

    _convertType(node) {
        return ({"folder": NODE_TYPE_GROUP,
                 "bookmark": NODE_TYPE_BOOKMARK,
                 "separator": NODE_TYPE_SEPARATOR})[node.type];
    }

    _toBrowserType(node) {
        return ({NODE_TYPE_GROUP: "folder",
                 NODE_TYPE_SHELF: "folder",
                 NODE_TYPE_ARCHIVE: "bookmark",
                 NODE_TYPE_BOOKMARK: "bookmark",
                 NODE_TYPE_NOTES: "separator",
                 NODE_TYPE_SEPARATOR: "separator"})[node.type];
    }


    convertBookmark(bookmark, parent) {
        return {
            pos: bookmark.index,
            uri: bookmark.url,
            name: bookmark.title,
            type: this._convertType(bookmark),
            parent_id: parent.id,
            date_added: bookmark.dateAdded,
            external: FIREFOX_SHELF_NAME,
            external_id: bookmark.id
        };
    }

    async deleteBrowserBookmarks(nodes) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        let externalEndpoints = nodes.filter(n => n.external === FIREFOX_SHELF_NAME && isEndpoint(n));

        let externalGroups = nodes.filter(n => n.external === FIREFOX_SHELF_NAME
            &&  n.type === NODE_TYPE_GROUP);

        return this.muteBrowserListeners(async () => {
            await Promise.all(externalGroups.map(n => {
                try {
                    return browser.bookmarks.removeTree(n.external_id);
                }
                catch (e) {
                    //console.log(e);
                }
            }));

            return Promise.all(externalEndpoints.map(n => {
                try {
                    return browser.bookmarks.remove(n.external_id);
                }
                catch (e) {
                    //console.log(e);
                }
            }));
        });
    }

    async renameBrowserBookmark(node) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        if (node.external === FIREFOX_SHELF_NAME) {
            return this.muteBrowserListeners(async () => browser.bookmarks.update(node.external_id, {title: node.name}));
        }
    }

    async updateBrowserBookmark(node) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        if (node.external === FIREFOX_SHELF_NAME) {
            return this.muteBrowserListeners(async () => browser.bookmarks.update(node.external_id,
                {title: node.name,
                 url: node.uri}));
        }
    }

    async createBrowserBookmark(node, parent_id) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        let type = this._toBrowserType(node);
        return browser.bookmarks.create({url: node.uri,
                                         title: node.name,
                                         type: type,
                                         parentId: parent_id,
                                         index: type === "folder"? undefined: node.pos})
                                    .then(bookmark => {
                                        node.external = FIREFOX_SHELF_NAME;
                                        node.external_id = bookmark.id;
                                        return backend.updateNode(node);
                                    });
    }

    async moveBrowserBookmarks(nodes, dest_id) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        let dest = await backend.getNode(dest_id);
        let browser_nodes = nodes.filter(n => n.external === FIREFOX_SHELF_NAME);
        let other_nodes = nodes.filter(n => n.external !== FIREFOX_SHELF_NAME);

        return this.muteBrowserListeners(async () => {
            if (dest.external === FIREFOX_SHELF_NAME) {
                await Promise.all(browser_nodes.map(async n =>
                    browser.bookmarks.move(n.external_id, {parentId: dest.external_id, index: n.pos})
                ));

                return Promise.all(other_nodes.map(n => {
                    if (isContainer(n)) {
                        return this.traverse(n, (parent, node) =>
                            this.createBrowserBookmark(node, parent? parent.external_id: dest.external_id));
                    }
                    else
                        return this.createBrowserBookmark(n, dest.external_id)
                }));
            } else {
                return Promise.all(browser_nodes.map(async n => {
                    let id = n.external_id;

                    n.external = null;
                    n.external_id = null;
                    await backend.updateNode(n);

                    try {
                        if (isContainer(n)) {
                            await this.traverse(n, async (parent, node) => {
                                if (parent) {
                                    node.external = null;
                                    node.external_id = null;
                                    await backend.updateNode(node);
                                }
                            });
                            return browser.bookmarks.removeTree(id);
                        }
                        else
                            return browser.bookmarks.remove(id);
                    }
                    catch (e) {
                        console.log(e);
                    }
                }));
            }
        });
    }

    async copyBrowserBookmarks(nodes, dest_id) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        let dest = await backend.getNode(dest_id);
        let browser_nodes = nodes.filter(n => n.external === FIREFOX_SHELF_NAME);
        //let other_nodes = nodes.filter(n => n.external !== FIREFOX_SHELF_NAME);

        return this.muteBrowserListeners(async () => {
            if (dest.external === FIREFOX_SHELF_NAME) {
                return Promise.all(nodes.map(async n => {
                    if (isContainer(n)) {
                        return this.traverse(n, (parent, node) =>
                            this.createBrowserBookmark(node, parent? parent.external_id: dest.external_id));
                    }
                    else
                        return this.createBrowserBookmark(n, dest.external_id)
                }));
            } else {
                return Promise.all(browser_nodes.map(async n => {
                    n.external = null;
                    n.external_id = null;
                    await backend.updateNode(n);

                    try {
                        if (isContainer(n)) {
                            await this.traverse(n, async (parent, node) => {
                                if (parent) {
                                    node.external = null;
                                    node.external_id = null;
                                    await backend.updateNode(node);
                                }
                            });
                        }
                    }
                    catch (e) {
                        console.log(e);
                    }
                }));
            }
        });
    }

    async reorderBrowserBookmarks(nodes) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        nodes = nodes.filter(n => n.external === FIREFOX_SHELF_NAME);

        return this.muteBrowserListeners(() =>
            Promise.all(nodes.map(n => browser.bookmarks.move(n.external_id, {index: n.pos - 1})))
        );
    }

    async createBrowserBookmarkFolder(node, parent_id) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        if (typeof parent_id !== "object")
            parent_id = await backend.getNode(parent_id);

        if (parent_id && parent_id.external === FIREFOX_SHELF_NAME) {
            return this.muteBrowserListeners(() => {
                return this.createBrowserBookmark(node, parent_id.external_id);
            });
        }
    }

    onBookmarkCreated(id, bookmark) {
        (async () => {
            if (!settings.show_firefox_bookmarks() || this.isUILocked())
                return;

            this.getListenerLock();

            try {
                let parent = await backend.getExternalNode(bookmark.parentId, FIREFOX_SHELF_NAME);
                if (parent) {
                    let node = browserBackend.convertBookmark(bookmark, parent);

                    if (node.type === NODE_TYPE_BOOKMARK && node.uri)
                        node.icon = await getFavicon(node.uri);

                    node = await backend.addNode(node, false);

                    if (node.type === NODE_TYPE_BOOKMARK && !settings.do_not_switch_to_ff_bookmark())
                        browser.runtime.sendMessage({type: "BOOKMARK_CREATED", node: node});
                }
            }
            catch (e) {console.log(e)}

            this.releaseListenerLock();

        })();
    };

    onBookmarkRemoved(id, bookmark) {
        (async () => {
            if (!settings.show_firefox_bookmarks() || this.isUILocked())
                return;

            this.getListenerLock();

            try {
                let node = await backend.getExternalNode(id, FIREFOX_SHELF_NAME);
                if (node) {
                    await backend.deleteNodes([node.id], FIREFOX_SHELF_NAME);
                    browser.runtime.sendMessage({type: "EXTERNAL_NODE_REMOVED", node: node});
                }
            }
            catch (e) {console.log(e)}

            this.releaseListenerLock();
        })();
    };

    onBookmarkChanged(id, bookmark) {
        (async () => {
            if (!settings.show_firefox_bookmarks() || this.isUILocked())
                return;

            this.getListenerLock();

            try {
                let node = await backend.getExternalNode(id, FIREFOX_SHELF_NAME);
                if (node) {
                    node.uri = bookmark.url;
                    node.name = bookmark.title;
                    node = await backend.updateNode(node);
                    browser.runtime.sendMessage({type: "EXTERNAL_NODE_UPDATED", node: node});
                }
            }
            catch (e) {console.log(e)}

            this.releaseListenerLock();
        })();
    };

    onBookmarkMoved(id, bookmark) {
        (async () => {
            if (!settings.show_firefox_bookmarks() || this.isUILocked())
                return;

            this.getListenerLock();

            try {
                let parent = await backend.getExternalNode(bookmark.parentId, FIREFOX_SHELF_NAME);

                if (parent) {
                    let browser_children = await browser.bookmarks.getChildren(bookmark.parentId);
                    let db_children = [];
                    let node;

                    for (let c of browser_children) {
                        let db_child = await backend.getExternalNode(c.id, FIREFOX_SHELF_NAME);

                        if (db_child) {
                            if (c.id === id) {
                                node = db_child;
                                db_child.parent_id = parent.id;
                            }

                            db_child.pos = c.index;
                            db_children.push(db_child);
                        }
                    }

                    await backend.reorderNodes(db_children);
                    browser.runtime.sendMessage({type: "EXTERNAL_NODE_UPDATED", node: node});
                }
            }
            catch (e) {console.log(e)}

            this.releaseListenerLock();
        })();
    };

    getUILock() {
        this._uiSemaphore += 1;
    }

    releaseUILock() {
        this._uiSemaphore -= 1;
    }
    
    // checks if UI operation wants to to mute browser bookmark listeners to avoid bookmark doubling
    isUILocked() {
        return !!this._uiSemaphore;
    }

    getListenerLock() {
        this._listenerSemaphore += 1;
    }

    releaseListenerLock() {
        this._listenerSemaphore -= 1;
    }

    async isListenerLocked() {
        let ui_context = window !== await browser.runtime.getBackgroundPage();

        if (ui_context)
            return await browser.runtime.sendMessage({type: "GET_LISTENER_LOCK_STATE"});

        return !!this._listenerSemaphore;
    }

    async muteBrowserListeners(f) {
        let ui_context = window !== await browser.runtime.getBackgroundPage();
        //console.log(new Error().stack);

        this.getUILock();
        if (ui_context)
            await browser.runtime.sendMessage({type: "UI_LOCK_GET"});

        try {await f()} catch (e) {console.log(e);}

        if (ui_context)
            await browser.runtime.sendMessage({type: "UI_LOCK_RELEASE"});
        this.releaseUILock();
    }

    installBrowserListeners() {
        if (!this._listenersInstalled) {

            this._listenersInstalled = true;

            browser.bookmarks.onCreated.addListener(this._browserListenerOnBookmarkCreated);
            browser.bookmarks.onRemoved.addListener(this._browserListenerOnBookmarkRemoved);
            browser.bookmarks.onChanged.addListener(this._browserListenerOnBookmarkChanged);
            browser.bookmarks.onMoved.addListener(this._browserListenerOnBookmarkMoved);
        }
    }

    removeBrowserListeners() {
        if (this._listenersInstalled) {
            browser.bookmarks.onCreated.removeListener(this._browserListenerOnBookmarkCreated);
            browser.bookmarks.onRemoved.removeListener(this._browserListenerOnBookmarkRemoved);
            browser.bookmarks.onChanged.removeListener(this._browserListenerOnBookmarkChanged);
            browser.bookmarks.onMoved.removeListener(this._browserListenerOnBookmarkMoved);

            this._listenersInstalled = false;
        }
    }
}

browserBackend = new BrowserBackend();


class IDBBackend extends Storage {

    constructor() {
        super();
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

    listShelves() {
        return this.queryShelf();
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

    reorderNodes(positions) {
        browserBackend.reorderBrowserBookmarks(positions);
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

                await browserBackend.createBrowserBookmarkFolder(node, parent);
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
        await browserBackend.createBrowserBookmarkFolder(node, parent_id);

        return node;
    }

    async renameGroup(id, new_name) {
        let group = await this.getNode(id);

        if (group.name !== new_name) {
            if (group.name.toLocaleUpperCase() !== new_name.toLocaleUpperCase())
                group.name = await this._ensureUnique(group.parent_id, new_name);
            else
                group.name = new_name;

            await browserBackend.renameBrowserBookmark(group);

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

        await browserBackend.moveBrowserBookmarks(nodes, dest_id);

        for (let n of nodes) {
            n.parent_id = dest_id;
            n.name = await this._ensureUnique(dest_id, n.name);
        }

        await this.updateNodes(nodes);
        return this.queryFullSubtree(ids);
    }

    async copyNodes(ids, dest_id) {
        let all_nodes = await this.queryFullSubtree(ids);
        let new_nodes = [];

        for (let n of all_nodes) {
            let old_id = n.id;

            if (ids.some(n => n === old_id))
                n.parent_id = dest_id;

            n.name = await this._ensureUnique(dest_id, n.name);

            delete n.id;
            delete n.date_modified;

            Object.assign(n, await this.addNode(n, false));

            n.old_id = old_id;
            new_nodes.push(n);

            for (let nn of all_nodes) {
                if (nn.parent_id === old_id)
                    nn.parent_id = n.id;
            }

            if (n.type === NODE_TYPE_ARCHIVE) {
                try {
                    let blob = await this.fetchBlob(n.old_id);
                    if (blob) {
                        await this.storeBlob(n.id, blob.data, blob.type);
                        blob = null;
                    }

                    let notes = await this.fetchNotes(n.old_id);
                    if (notes) {
                        await this.storeNotes(n.id, notes.content);
                        notes = null;
                    }

                    let index = await this.fetchIndex(n.old_id);
                    if (index) {
                        await this.storeIndex(n.id, index.words);
                        index = null;
                    }
                }
                catch (e) {
                    console.log(e);
                }
            }
        }

        await browserBackend.copyBrowserBookmarks(new_nodes.filter(n => ids.some(id => id === n.old_id)), dest_id);

        return new_nodes;
    }

    async deleteNodes(ids) {
        let all_nodes = await this.queryFullSubtree(ids);

        await browserBackend.deleteBrowserBookmarks(all_nodes);

        return super.deleteNodesLowLevel(all_nodes.map(n => n.id));
    }

    async deleteChildNodes(id) {
        let all_nodes = await this.queryFullSubtree(id);

        return super.deleteNodesLowLevel(all_nodes.map(n => n.id).filter(i => i !== id));
    }

    async addBookmark(data, node_type = NODE_TYPE_BOOKMARK) {
        let group, parent, parent_id;

        if (data.parent_id) {
            parent_id = data.parent_id = parseInt(data.parent_id);
        }
        else {
            group = await this.getGroupByPath(data.path);
            parent_id = data.parent_id = group.id;
            delete data.path;
        }

        data.name = await this._ensureUnique(data.parent_id, data.name);

        data.type = node_type;
        data.tag_list = this._splitTags(data.tags);
        this.addTags(data.tag_list);

        let node = await this.addNode(data);

        let browser_bookmark = group && group.external === FIREFOX_SHELF_NAME
            || (parent = await this.getNode(parent_id)).external === FIREFOX_SHELF_NAME;

        if (browser_bookmark) {
            if (!parent)
                parent = await this.getNode(parent_id);

            await browserBackend.muteBrowserListeners(() =>
                browserBackend.createBrowserBookmark(node, parent.external_id));
        }

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

        return this.addNode(data, false);
    }

    async updateBookmark(data) {
        let update = {};
        Object.assign(update, data);

        update.tag_list = this._splitTags(update.tags);
        this.addTags(update.tag_list);

        await browserBackend.updateBrowserBookmark(update);

        return this.updateNode(update);
    }

    // should only be called in the background script through message
    async reconcileBrowserBookmarksDB() {
        let get_icons = [];
        let browser_ids = [];
        let begin = new Date().getTime();

        let reconcile = async (d, b) => { // node, bookmark
            let promises = [];

            for (let bc of b.children) {
                browser_ids.push(bc.id);

                let node = await this.getExternalNode(bc.id, FIREFOX_SHELF_NAME);
                if (node) {
                    node.name = bc.title;
                    node.uri = bc.url;
                    node.pos = bc.index;
                    node.parent_id = d.id;
                    await this.updateNode(node);
                }
                else {
                    node = await this.addNode(browserBackend.convertBookmark(bc, d), false);

                    if (node.type === NODE_TYPE_BOOKMARK && node.uri)
                        get_icons.push([node.id, node.uri])
                }

                if (bc.type === "folder")
                    promises.push(reconcile(node, bc));
            }

            return Promise.all(promises);
        };

        if (settings.show_firefox_bookmarks()) {
            browserBackend.removeBrowserListeners();

            let db_root = await this.getNode(FIREFOX_SHELF_ID);
            if (!db_root)
                db_root = await this.addNode(browserBackend.newBrowserRootNode(), false);

            let [browser_root] = await browser.bookmarks.getTree();
            await reconcile(db_root, browser_root).then(async () => {
                await this.deleteMissingExternalNodes(browser_ids, FIREFOX_SHELF_NAME);

                console.log("reconciliation time: " + ((new Date().getTime() - begin) / 1000) + "s");

                browser.runtime.sendMessage({type: "EXTERNAL_NODES_READY"});

                for (let item of get_icons) {
                    let node = await this.getNode(item[0]);
                    node.icon = await getFavicon(item[1]);
                    //console.log(node.icon + " (" + item[1] + ")");
                    await this.updateNode(node);
                }

                if (get_icons.length)
                    setTimeout(() => browser.runtime.sendMessage({type: "EXTERNAL_NODES_READY"}, 500));

                browserBackend.installBrowserListeners();
            });
        }
        else {
            browserBackend.removeBrowserListeners();
            await this.deleteExternalNodes(null, FIREFOX_SHELF_NAME);
            browser.runtime.sendMessage({type: "EXTERNAL_NODES_READY"});
        }
    }
}

// let backend = new HTTPBackend("http://localhost:31800", "default:default");
backend = new IDBBackend();

export {backend, browserBackend};
