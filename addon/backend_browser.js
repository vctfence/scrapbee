import {send} from "./proxy.js";
import {settings} from "./settings.js";
import {backend} from "./backend.js";
import {
    FIREFOX_BOOKMARK_MENU,
    FIREFOX_BOOKMARK_UNFILED, FIREFOX_SHELF_ID, FIREFOX_SHELF_NAME, FIREFOX_SHELF_UUID,
    NODE_TYPE_BOOKMARK, NODE_TYPE_GROUP, NODE_TYPE_SEPARATOR, NODE_TYPE_SHELF,
    isContainer, isEndpoint,
} from "./storage_constants.js";
import {getFavicon} from "./favicon.js";

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

    newBrowserRootNode() {
        return {id: FIREFOX_SHELF_ID,
            pos: -1,
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

    async deleteBookmarks(nodes) {
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
                    //console.error(e);
                }
            }));

            return Promise.all(externalEndpoints.map(n => {
                try {
                    return browser.bookmarks.remove(n.external_id);
                }
                catch (e) {
                    //console.error(e);
                }
            }));
        });
    }

    async renameBookmark(node) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        if (node.external === FIREFOX_SHELF_NAME) {
            return this.muteBrowserListeners(async () => browser.bookmarks.update(node.external_id, {title: node.name}));
        }
    }

    async updateBookmark(node) {
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

    async createBookmark(node, parent) {
        if (parent.external === FIREFOX_SHELF_NAME) {
            await this.muteBrowserListeners(async () =>
                await this.createBrowserBookmark(node, parent.external_id));
        }
    }

    async createBookmarkFolder(node, parent_id) {
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

    async moveBookmarks(nodes, dest_id) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        let dest = await backend.getNode(dest_id);
        let browser_nodes = nodes.filter(n => n.external === FIREFOX_SHELF_NAME);
        let other_nodes = nodes.filter(n => n.external !== FIREFOX_SHELF_NAME);

        if (dest.external !== FIREFOX_SHELF_NAME && !browser_nodes.length)
            return;

        return this.muteBrowserListeners(async () => {
            if (dest.external === FIREFOX_SHELF_NAME) {
                await Promise.all(browser_nodes.map(async n =>
                    browser.bookmarks.move(n.external_id, {parentId: dest.external_id, index: n.pos})
                ));

                return Promise.all(other_nodes.map(n => {
                    if (isContainer(n)) {
                        return backend.traverse(n, (parent, node) =>
                            this.createBrowserBookmark(node, parent? parent.external_id: dest.external_id));
                    }
                    else
                        return this.createBrowserBookmark(n, dest.external_id)
                }));
            } else {
                return Promise.all(browser_nodes.map(async n => {
                    let id = n.external_id;

                    n.external = undefined;
                    n.external_id = undefined;
                    await backend.updateNode(n);

                    try {
                        if (isContainer(n)) {
                            await backend.traverse(n, async (parent, node) => {
                                if (parent) {
                                    node.external = undefined;
                                    node.external_id = undefined;
                                    await backend.updateNode(node);
                                }
                            });
                            return browser.bookmarks.removeTree(id);
                        }
                        else
                            return browser.bookmarks.remove(id);
                    }
                    catch (e) {
                        console.error(e);
                    }
                }));
            }
        });
    }

    async copyBookmarks(nodes, dest_id) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        let dest = await backend.getNode(dest_id);
        let browser_nodes = nodes.filter(n => n.external === FIREFOX_SHELF_NAME);
        //let other_nodes = nodes.filter(n => n.external !== FIREFOX_SHELF_NAME);

        if (dest.external !== FIREFOX_SHELF_NAME && !browser_nodes.length)
            return;

        return this.muteBrowserListeners(async () => {
            if (dest.external === FIREFOX_SHELF_NAME) {
                return Promise.all(nodes.map(async n => {
                    if (isContainer(n)) {
                        return backend.traverse(n, (parent, node) =>
                            this.createBrowserBookmark(node, parent? parent.external_id: dest.external_id));
                    }
                    else
                        return this.createBrowserBookmark(n, dest.external_id)
                }));
            } else {
                return Promise.all(browser_nodes.map(async n => {
                    n.external = undefined;
                    n.external_id = undefined;
                    await backend.updateNode(n);

                    try {
                        if (isContainer(n)) {
                            await backend.traverse(n, async (parent, node) => {
                                if (parent) {
                                    node.external = undefined;
                                    node.external_id = undefined;
                                    await backend.updateNode(node);
                                }
                            });
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                }));
            }
        });
    }

    async reorderBookmarks(nodes) {
        if (!settings.show_firefox_bookmarks() || await this.isListenerLocked())
            return;

        nodes = nodes.filter(n => n.external === FIREFOX_SHELF_NAME && n.external_id);

        if (nodes.length)
            return this.muteBrowserListeners(async () => {
                for (let n of nodes) {
                    await browser.bookmarks.move(n.external_id, {index: n.pos});
                }
            });
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

                    let icon = null;

                    if (node.type === NODE_TYPE_BOOKMARK && node.uri) {
                        icon = await getFavicon(node.uri);
                        if (icon && typeof icon === "string")
                            node.icon = icon;
                        else if (icon)
                            node.icon = icon.url;
                    }

                    node = await backend.addNode(node);

                    if (icon && typeof icon === "string")
                        await backend.storeIcon(node);
                    else if (icon)
                        await backend.storeIcon(node, icon.response, icon.type);

                    if (node.type === NODE_TYPE_BOOKMARK && !settings.do_not_switch_to_ff_bookmark())
                        send.bookmarkCreated({node: node});
                }
            }
            catch (e) {console.error(e)}

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
                    send.externalNodeRemoved({node: node});
                }
            }
            catch (e) {console.error(e)}

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
                    send.externalNodeUpdated({node: node});
                }
            }
            catch (e) {console.error(e)}

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
                    let updated_node;

                    for (let c of browser_children) {
                        let db_child = await backend.getExternalNode(c.id, FIREFOX_SHELF_NAME);

                        if (db_child) {
                            if (c.id === id) {
                                updated_node = db_child;
                                db_child.parent_id = parent.id;
                            }

                            db_child.pos = c.index;
                            db_children.push(db_child);
                        }
                    }

                    await backend.reorderNodes(db_children);

                    if (updated_node.type === NODE_TYPE_BOOKMARK && !settings.do_not_switch_to_ff_bookmark())
                        send.bookmarkCreated({node: updated_node});
                    //send.externalNodeUpdated({node: updated_node});
                }
            }
            catch (e) {console.error(e)}

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
        let ui_context = window !== browser.extension.getBackgroundPage();

        if (ui_context)
            return await send.getListenerLockState();

        return !!this._listenerSemaphore;
    }

    async muteBrowserListeners(f) {
        let ui_context = window !== browser.extension.getBackgroundPage();
        //console.log(new Error().stack);

        if (ui_context)
            await send.uiLockGet();
        else
            this.getUILock();

        try {await f()} catch (e) {console.error(e);}

        if (ui_context)
            await send.uiLockRelease();
        else
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

    // should only be called in the background script through message
    async reconcileBrowserBookmarksDB() {
        let get_icons = [];
        let browser_ids = [];
        let begin_time = new Date().getTime();
        let db_pool = new Map();

        let reconcile = async (d, b) => { // node, bookmark
            for (let bc of b.children) {
                browser_ids.push(bc.id);

                let node = db_pool.get(bc.id);
                if (node) {
                    if (node.name !== bc.title || node.uri !== bc.url
                        || node.pos !== bc.index || node.parent_id !== d.id) {
                        node.name = bc.title;
                        node.uri = bc.url;
                        node.pos = bc.index;
                        node.parent_id = d.id;
                        await backend.updateNode(node);
                    }
                }
                else {
                    node = await backend.addNode(this.convertBookmark(bc, d), false);

                    if (node.type === NODE_TYPE_BOOKMARK && node.uri)
                        get_icons.push([node.id, node.uri])
                }

                if (bc.type === "folder")
                    await reconcile(node, bc);
            }
        };

        if (settings.show_firefox_bookmarks()) {
            this.removeBrowserListeners();

            let db_root = await backend.getNode(FIREFOX_SHELF_ID);
            if (!db_root) {
                db_root = await backend.addNode(this.newBrowserRootNode(),
                    false, true, false);
                send.shelvesChanged();
            }

            let [browser_root] = await browser.bookmarks.getTree();

            db_pool = new Map((await backend.getExternalNodes(FIREFOX_SHELF_NAME)).map(n => [n.external_id, n]));

            await reconcile(db_root, browser_root).then(async () => {
                browser_root = null;
                db_pool = null;

                await backend.deleteMissingExternalNodes(browser_ids, FIREFOX_SHELF_NAME);

                //console.log("reconciliation time: " + ((new Date().getTime() - begin_time) / 1000) + "s");
                send.externalNodesReady();

                for (let item of get_icons) {
                    let node = await backend.getNode(item[0]);
                    if (node) {
                        try {
                            const icon = await getFavicon(node.uri);
                            if (icon && typeof icon === "string") {
                                node.icon = icon;
                                await backend.storeIcon(node);
                            }
                            else if (icon) {
                                node.icon = icon.url;
                                await backend.storeIcon(node, icon.response, icon.type);
                            }
                            await backend.updateNode(node);
                        } catch (e) {
                            console.error(e);
                        }
                    }
                    //console.log(node.icon + " (" + item[1] + ")");
                }

                backend.getExternalNode(FIREFOX_BOOKMARK_MENU, FIREFOX_SHELF_NAME).then(node => {
                    if (node)
                        browser.extension.getBackgroundPage()._browserBookmarkPath = FIREFOX_SHELF_NAME + "/" + node.name;
                });

                backend.getExternalNode(FIREFOX_BOOKMARK_UNFILED, FIREFOX_SHELF_NAME).then(node => {
                    if (node)
                        browser.extension.getBackgroundPage()._unfiledBookmarkPath = FIREFOX_SHELF_NAME + "/" + node.name;
                });

                if (get_icons.length)
                    setTimeout(() => send.externalNodesReady(), 500);

                this.installBrowserListeners();
            });
        }
        else {
            this.removeBrowserListeners();
            await backend.deleteExternalNodes(null, FIREFOX_SHELF_NAME);
            send.shelvesChanged();
        }
    }

}

export let browserBackend = new BrowserBackend();
