import {send} from "./proxy.js";
import {settings} from "./settings.js";
import {backend} from "./backend.js";
import {
    FIREFOX_BOOKMARK_MENU, FIREFOX_BOOKMARK_UNFILED,
    FIREFOX_SHELF_ID, FIREFOX_SHELF_NAME, FIREFOX_SHELF_UUID,
    NODE_TYPE_BOOKMARK, NODE_TYPE_GROUP, NODE_TYPE_SEPARATOR, NODE_TYPE_SHELF, NODE_TYPE_ARCHIVE,
    NODE_TYPE_NOTES,
    isContainer, isEndpoint,
} from "./storage.js";

const CATEGORY_ADDED = 0;
const CATEGORY_CHANGED = 1;
const CATEGORY_MOVED = 2;
const CATEGORY_REMOVED = 3;

export class BrowserBackend {

    constructor() {
        this._browserListenerOnBookmarkCreated = BrowserBackend.onBookmarkCreated.bind(this);
        this._browserListenerOnBookmarkRemoved = BrowserBackend.onBookmarkRemoved.bind(this);
        this._browserListenerOnBookmarkChanged = BrowserBackend.onBookmarkChanged.bind(this);
        this._browserListenerOnBookmarkMoved = BrowserBackend.onBookmarkMoved.bind(this);
        this._listenersInstalled = false;

        this._uiSemaphore = 0;
        this._listenerSemaphore = 0;

        // bookmark ids that were operated through the Scrapyard UI
        // used to mute the corresponding listeners to avoid bookmark duplication
        this._uiBookmarks = {
            [CATEGORY_ADDED]: [],
            [CATEGORY_CHANGED]: [],
            [CATEGORY_MOVED]: [],
            [CATEGORY_REMOVED]: []
        };
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
        return ({[NODE_TYPE_GROUP]: "folder",
                 [NODE_TYPE_SHELF]: "folder",
                 [NODE_TYPE_ARCHIVE]: "bookmark",
                 [NODE_TYPE_BOOKMARK]: "bookmark",
                 [NODE_TYPE_NOTES]: "separator",
                 [NODE_TYPE_SEPARATOR]: "separator"})[node.type];
    }

    _isUIContext() {
        return window.location.pathname !== "/background.html";
    }

    markUIBookmarks(bookmarks, category) {
        if (this._isUIContext()) {
            send.memorizeUIBookmarks({bookmarks, category})
        }
        else {
            if (!Array.isArray(bookmarks))
                bookmarks = [bookmarks];

            this._uiBookmarks[category] = [...this._uiBookmarks[category], ...bookmarks];
        }

        let unmark = () => {
            for (const bookmark of bookmarks) {
                let index = this._uiBookmarks[category].indexOf(bookmark);
                if (index >= 0)
                    this._uiBookmarks[category].splice(index, 1);
            }
        };

        setTimeout(unmark, 10000);
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

    async createBrowserBookmark(node, parentId) {
        const type = this._toBrowserType(node);
        const bookmark = await browser.bookmarks.create({
                                            url: node.uri,
                                            title: node.type === NODE_TYPE_SEPARATOR? undefined: node.name,
                                            type: type,
                                            parentId: parentId,
                                            index: type === "folder"? undefined: node.pos
                                        });

        this.markUIBookmarks(bookmark.id, CATEGORY_ADDED);

        node.external = FIREFOX_SHELF_NAME;
        node.external_id = bookmark.id;
        return backend.updateNode(node);
    }

    async createBookmark(node, parent) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        if (parent.external === FIREFOX_SHELF_NAME)
            return this.muteBrowserListeners(() => this.createBrowserBookmark(node, parent.external_id));
    }

    async createBookmarkFolder(node, parentId) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        if (typeof parentId !== "object")
            parentId = await backend.getNode(parentId);

        if (parentId && parentId.external === FIREFOX_SHELF_NAME)
            return this.muteBrowserListeners(() => this.createBrowserBookmark(node, parentId.external_id));
    }

    async deleteBookmarks(nodes) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        let externalEndpoints = nodes.filter(n => n.external === FIREFOX_SHELF_NAME
                                                        && (isEndpoint(n) || n.type === NODE_TYPE_SEPARATOR));

        let externalGroups = nodes.filter(n => n.external === FIREFOX_SHELF_NAME &&  n.type === NODE_TYPE_GROUP);

        if (externalEndpoints.length || externalGroups.length)
            return this.muteBrowserListeners(async () => {
                await Promise.all(externalGroups.map(n => {
                    try {
                        this.markUIBookmarks(n.external_id, CATEGORY_REMOVED);
                        return browser.bookmarks.removeTree(n.external_id);
                    }
                    catch (e) {
                        console.error(e);
                    }
                }));

                return Promise.all(externalEndpoints.map(n => {
                    try {
                        this.markUIBookmarks(n.external_id, CATEGORY_REMOVED);
                        return browser.bookmarks.remove(n.external_id);
                    }
                    catch (e) {
                        console.error(e);
                    }
                }));
            });
    }

    async renameBookmark(node) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        if (node.external === FIREFOX_SHELF_NAME) {
            this.markUIBookmarks(node.external_id, CATEGORY_CHANGED);
            return this.muteBrowserListeners(async () => browser.bookmarks.update(node.external_id, {title: node.name}));
        }
    }

    async updateBookmark(node) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        if (node.external === FIREFOX_SHELF_NAME) {
            this.markUIBookmarks(node.external_id, CATEGORY_CHANGED);
            return this.muteBrowserListeners(async () => browser.bookmarks.update(node.external_id,
                                                                                    {title: node.name, url: node.uri}));
        }
    }

    async moveBookmarks(nodes, destId) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        let dest = await backend.getNode(destId);
        let browserNodes = nodes.filter(n => n.external === FIREFOX_SHELF_NAME);
        let otherNodes = nodes.filter(n => n.external !== FIREFOX_SHELF_NAME);

        if (dest.external !== FIREFOX_SHELF_NAME && !browserNodes.length)
            return;

        return this.muteBrowserListeners(async () => {
            if (dest.external === FIREFOX_SHELF_NAME) {
                await Promise.all(browserNodes.map(n => {
                        this.markUIBookmarks(n.external_id, CATEGORY_MOVED);
                        return browser.bookmarks.move(n.external_id, {parentId: dest.external_id, index: n.pos})
                    }
                ));

                return Promise.all(otherNodes.map(n => {
                    if (isContainer(n)) {
                        return backend.traverse(n, (parent, node) =>
                            this.createBrowserBookmark(node, parent? parent.external_id: dest.external_id));
                    }
                    else
                        return this.createBrowserBookmark(n, dest.external_id)
                }));
            } else {
                return Promise.all(browserNodes.map(async n => {
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
                            this.markUIBookmarks(id, CATEGORY_REMOVED);
                            return browser.bookmarks.removeTree(id);
                        }
                        else {
                            this.markUIBookmarks(id, CATEGORY_REMOVED);
                            return browser.bookmarks.remove(id);
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                }));
            }
        });
    }

    async copyBookmarks(nodes, destId) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        let dest = await backend.getNode(destId);
        let browserNodes = nodes.filter(n => n.external === FIREFOX_SHELF_NAME);
        //let other_nodes = nodes.filter(n => n.external !== FIREFOX_SHELF_NAME);

        if (dest.external !== FIREFOX_SHELF_NAME && !browserNodes.length)
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
                return Promise.all(browserNodes.map(async n => {
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
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        nodes = nodes.filter(n => n.external === FIREFOX_SHELF_NAME && n.external_id);

        if (nodes.length)
            return this.muteBrowserListeners(async () => {
                for (let n of nodes) {
                    this.markUIBookmarks(n.external_id, CATEGORY_MOVED);
                    await browser.bookmarks.move(n.external_id, {index: n.pos});
                }
            });
    }

    static async onBookmarkCreated(id, bookmark) {
        if (!settings.show_firefox_bookmarks() || this.isLockedByUI(id, CATEGORY_ADDED))
            return;

        this.getListenerLock();

        try {
            let parent = await backend.getExternalNode(bookmark.parentId, FIREFOX_SHELF_NAME);
            if (parent) {
                let node = this.convertBookmark(bookmark, parent);
                node = await backend.addNode(node);
                await backend.storeIconFromURI(node);

                if (node.type === NODE_TYPE_BOOKMARK && !settings.do_not_switch_to_ff_bookmark())
                    send.bookmarkCreated({node: node});
            }
        }
        catch (e) {console.error(e)}

        this.releaseListenerLock();
    }

    static async onBookmarkRemoved(id, bookmark) {
        if (!settings.show_firefox_bookmarks() || this.isLockedByUI(id, CATEGORY_REMOVED))
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
    }

    static async onBookmarkChanged(id, bookmark) {
        if (!settings.show_firefox_bookmarks() || this.isLockedByUI(id, CATEGORY_CHANGED))
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
    }

    static async onBookmarkMoved(id, bookmark) {
        if (!settings.show_firefox_bookmarks() || this.isLockedByUI(id, CATEGORY_MOVED))
            return;

        this.getListenerLock();

        try {
            let parent = await backend.getExternalNode(bookmark.parentId, FIREFOX_SHELF_NAME);

            if (parent) {
                let browserChildren = await browser.bookmarks.getChildren(bookmark.parentId);
                let dbChildren = [];
                let updatedNode;

                for (let c of browserChildren) {
                    let dbChild = await backend.getExternalNode(c.id, FIREFOX_SHELF_NAME);

                    if (dbChild) {
                        if (c.id === id) {
                            updatedNode = dbChild;
                            dbChild.parent_id = parent.id;
                        }

                        dbChild.pos = c.index;
                        dbChildren.push(dbChild);
                    }
                }

                await backend.reorderNodes(dbChildren);

                if (updatedNode.type === NODE_TYPE_BOOKMARK && !settings.do_not_switch_to_ff_bookmark())
                    send.bookmarkCreated({node: updatedNode});
                //send.externalNodeUpdated({node: updated_node});
            }
        }
        catch (e) {console.error(e)}

        this.releaseListenerLock();
    }

    getUILock() {
        this._uiSemaphore += 1;
    }

    releaseUILock() {
        this._uiSemaphore -= 1;
    }

    // checks if UI operation wants to to mute browser bookmark listeners to avoid bookmark doubling
    isLockedByUI(bookmarkId, category) {
        return !!this._uiSemaphore || this._uiBookmarks[category].some(id => id === bookmarkId);
    }

    getListenerLock() {
        this._listenerSemaphore += 1;
    }

    releaseListenerLock() {
        this._listenerSemaphore -= 1;
    }

    // used to mute the calls of this class methods that may be invoked by backend methods used in listeners
    async isLockedByListeners() {
        if (this._isUIContext())
            return send.getListenerLockState();

        return !!this._listenerSemaphore;
    }

    async muteBrowserListeners(f) {
        let uiContext = this._isUIContext();

        if (uiContext)
            await send.uiLockGet();
        else
            this.getUILock();

        try {await f()} catch (e) {console.error(e);}

        if (uiContext)
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
        let getIcons = [];
        let browserIds = [];
        let beginTime = new Date().getTime();
        let dbPool = new Map();

        let reconcile = async (databaseNode, bookmark) => { // node, bookmark
            for (let browserNode of bookmark.children) {
                browserIds.push(browserNode.id);

                let node = dbPool.get(browserNode.id);
                if (node) {
                    if (node.name !== browserNode.title || node.uri !== browserNode.url
                        || node.pos !== browserNode.index || node.parent_id !== databaseNode.id) {
                        node.name = browserNode.title;
                        node.uri = browserNode.url;
                        node.pos = browserNode.index;
                        node.parent_id = databaseNode.id;
                        await backend.updateNode(node);
                    }
                }
                else {
                    node = await backend.addNode(this.convertBookmark(browserNode, databaseNode), false);

                    if (node.type === NODE_TYPE_BOOKMARK && node.uri)
                        getIcons.push([node.id, node.uri])
                }

                if (browserNode.type === "folder")
                    await reconcile(node, browserNode);
            }
        };

        if (settings.show_firefox_bookmarks()) {
            this.removeBrowserListeners();

            let dbRoot = await backend.getNode(FIREFOX_SHELF_ID);
            if (!dbRoot) {
                dbRoot = await backend.addNode(this.newBrowserRootNode(),
                    false, true, false);
                send.shelvesChanged();
            }

            let [browserRoot] = await browser.bookmarks.getTree();

            dbPool = new Map((await backend.getExternalNodes(FIREFOX_SHELF_NAME)).map(n => [n.external_id, n]));

            await reconcile(dbRoot, browserRoot).then(async () => {
                browserRoot = null;
                dbPool = null;

                await backend.deleteMissingExternalNodes(browserIds, FIREFOX_SHELF_NAME);

                //console.log("reconciliation time: " + ((new Date().getTime() - beginTime) / 1000) + "s");
                send.externalNodesReady();

                for (let item of getIcons) {
                    let node = await backend.getNode(item[0]);
                    await backend.storeIconFromURI(node);
                }

                backend.getExternalNode(FIREFOX_BOOKMARK_MENU, FIREFOX_SHELF_NAME).then(node => {
                    if (node)
                        browser.extension.getBackgroundPage()._browserBookmarkPath = FIREFOX_SHELF_NAME + "/" + node.name;
                });

                backend.getExternalNode(FIREFOX_BOOKMARK_UNFILED, FIREFOX_SHELF_NAME).then(node => {
                    if (node)
                        browser.extension.getBackgroundPage()._unfiledBookmarkPath = FIREFOX_SHELF_NAME + "/" + node.name;
                });

                if (getIcons.length)
                    setTimeout(() => send.externalNodesReady(), 500);

                this.installBrowserListeners();
            });
        }
        else {
            this.removeBrowserListeners();
            await backend.deleteExternalNodes(FIREFOX_SHELF_NAME);
            send.shelvesChanged();
        }
    }

}

export let browserBackend = new BrowserBackend();
