import {send} from "./proxy.js";
import {settings} from "./settings.js";
import {
    FIREFOX_BOOKMARK_MENU, FIREFOX_BOOKMARK_UNFILED,
    BROWSER_SHELF_ID, BROWSER_SHELF_NAME, BROWSER_SHELF_UUID,
    NODE_TYPE_BOOKMARK, NODE_TYPE_FOLDER, NODE_TYPE_SEPARATOR, NODE_TYPE_SHELF, NODE_TYPE_ARCHIVE,
    NODE_TYPE_NOTES,
    isContainerNode, isContentNode, FIREFOX_SPECIAL_FOLDERS, BROWSER_EXTERNAL_TYPE,
} from "./storage.js";
import {ExternalNode} from "./storage_node_external.js";
import {Path} from "./path.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Icon, Node} from "./storage_entities.js";
import {CONTEXT_FOREGROUND, getContextType} from "./utils_browser.js";
import {Shelf} from "./bookmarks_shelf.js";
import {createScrapyardToolbarReference} from "./bookmarking.js";

const CATEGORY_ADDED = 0;
const CATEGORY_CHANGED = 1;
const CATEGORY_MOVED = 2;
const CATEGORY_REMOVED = 3;

export class BrowserShelfPlugin {

    constructor() {
        this._browserListenerOnBookmarkCreated = BrowserShelfPlugin.onBookmarkCreated.bind(this);
        this._browserListenerOnBookmarkRemoved = BrowserShelfPlugin.onBookmarkRemoved.bind(this);
        this._browserListenerOnBookmarkChanged = BrowserShelfPlugin.onBookmarkChanged.bind(this);
        this._browserListenerOnBookmarkMoved = BrowserShelfPlugin.onBookmarkMoved.bind(this);
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
        return {id: BROWSER_SHELF_ID,
                pos: -1,
                name: BROWSER_SHELF_NAME,
                uuid: BROWSER_SHELF_UUID,
                type: NODE_TYPE_SHELF,
                external: BROWSER_EXTERNAL_TYPE};
    }

    _convertType(node) {
        if (!node.type) {
            if (node.children || !node.url)
                node.type = "folder";
            else
                node.type = "bookmark";
        }

        return ({"folder": NODE_TYPE_FOLDER,
                 "bookmark": NODE_TYPE_BOOKMARK,
                 "separator": NODE_TYPE_SEPARATOR})[node.type];
    }

    _toBrowserType(node) {
        return ({[NODE_TYPE_FOLDER]: "folder",
                 [NODE_TYPE_SHELF]: "folder",
                 [NODE_TYPE_ARCHIVE]: "bookmark",
                 [NODE_TYPE_BOOKMARK]: "bookmark",
                 [NODE_TYPE_NOTES]: "separator",
                 [NODE_TYPE_SEPARATOR]: "separator"})[node.type];
    }

    _isUIContext() {
        return getContextType() === CONTEXT_FOREGROUND;
    }

    lockUIBookmarks(bookmarks, category) {
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

    _convertBookmark(bookmark, parent) {
        return {
            pos: bookmark.index,
            uri: bookmark.url,
            name: bookmark.title,
            type: this._convertType(bookmark),
            parent_id: parent.id,
            date_added: bookmark.dateAdded,
            external: BROWSER_EXTERNAL_TYPE,
            external_id: bookmark.id
        };
    }

    async _createBrowserBookmark(node, parentId) {
        if (!node.uri && !(isContainerNode(node) || node.type === NODE_TYPE_SEPARATOR))
            return;

        const type = this._toBrowserType(node);
        const bookmark = await browser.bookmarks.create({
            url: node.uri,
            title: node.type === NODE_TYPE_SEPARATOR? undefined: node.name,
            type: type,
            parentId: parentId,
            index: node.pos
        });

        this.lockUIBookmarks(bookmark.id, CATEGORY_ADDED);

        if (node.type === NODE_TYPE_ARCHIVE)
            node.type = NODE_TYPE_BOOKMARK;
        node.external = BROWSER_EXTERNAL_TYPE;
        node.external_id = bookmark.id;
        return Node.update(node);
    }

    async createBookmarkFolder(node, parent) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        return this._withMutedListeners(() => this._createBrowserBookmark(node, parent.external_id));
    }

    async createBookmark(node, parent) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        return this._withMutedListeners(() => this._createBrowserBookmark(node, parent.external_id));
    }

    async renameBookmark(node) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        this.lockUIBookmarks(node.external_id, CATEGORY_CHANGED);
        return this._withMutedListeners(async () => browser.bookmarks.update(node.external_id, {title: node.name}));
    }

    async moveBookmarks(dest, nodes) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        let browserNodes = nodes.filter(n => n.external === BROWSER_EXTERNAL_TYPE);
        let otherNodes = nodes.filter(n => n.external !== BROWSER_EXTERNAL_TYPE);

        return this._withMutedListeners(async () => {
            if (dest.external === BROWSER_EXTERNAL_TYPE) {
                await Promise.all(browserNodes.map(n => {
                        this.lockUIBookmarks(n.external_id, CATEGORY_MOVED);
                        return browser.bookmarks.move(n.external_id, {parentId: dest.external_id, index: n.pos})
                    }));

                return Promise.all(otherNodes.map(async n => {
                    if (isContainerNode(n))
                        return Bookmark.traverse(n, async (parent, node) => {
                            await Node.unpersist(node);
                            await this._createBrowserBookmark(node, parent? parent.external_id: dest.external_id);
                        });
                    else {
                        await Node.unpersist(n);
                        await this._createBrowserBookmark(n, dest.external_id);
                    }
                }));
            } else {
                return Promise.all(browserNodes.map(async n => {
                    let id = n.external_id;

                    n.external = dest.external;
                    n.external_id = undefined;
                    await Node.update(n);
                    await this._persistNodeIcon(n);

                    try {
                        if (isContainerNode(n)) {
                            await Bookmark.traverse(n, async (parent, node) => {
                                if (parent) {
                                    node.external = dest.external;
                                    node.external_id = undefined;
                                    await Node.update(node);
                                    await this._persistNodeIcon(node);
                                }
                            });
                            this.lockUIBookmarks(id, CATEGORY_REMOVED);
                            return browser.bookmarks.removeTree(id);
                        }
                        else {
                            this.lockUIBookmarks(id, CATEGORY_REMOVED);
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

    async copyBookmarks(dest, nodes) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        let browserNodes = nodes.filter(n => n.external === BROWSER_EXTERNAL_TYPE);
        //let other_nodes = nodes.filter(n => n.external !== BROWSER_SHELF_NAME);

        return this._withMutedListeners(async () => {
            if (dest.external === BROWSER_EXTERNAL_TYPE) {
                return Promise.all(nodes.map(async n => {
                    if (isContainerNode(n))
                        return Bookmark.traverse(n, async (parent, node) => {
                            await this._createBrowserBookmark(node, parent? parent.external_id: dest.external_id);
                        });
                    else
                        await this._createBrowserBookmark(n, dest.external_id);
                }));
            } else {
                return Promise.all(browserNodes.map(async n => {
                    n.external = dest.external;
                    n.external_id = undefined;
                    await Node.update(n);
                    await this._persistNodeIcon(n);

                    try {
                        if (isContainerNode(n)) {
                            await Bookmark.traverse(n, async (parent, node) => {
                                if (parent) {
                                    node.external = dest.external;
                                    node.external_id = undefined;
                                    await Node.update(node);
                                    await this._persistNodeIcon(node);
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

    async _persistNodeIcon(node) {
        const iconUrl = await Icon.get(node);
        return Icon.persist(node, iconUrl);
    }

    async deleteBookmarks(nodes) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        let externalEndpoints = nodes.filter(n => n.external === BROWSER_EXTERNAL_TYPE
                                                        && (isContentNode(n) || n.type === NODE_TYPE_SEPARATOR));

        let externalContainers = nodes.filter(n => n.external === BROWSER_EXTERNAL_TYPE &&  n.type === NODE_TYPE_FOLDER);

        if (externalEndpoints.length || externalContainers.length)
            return this._withMutedListeners(async () => {
                await Promise.all(externalContainers.map(n => {
                    try {
                        this.lockUIBookmarks(n.external_id, CATEGORY_REMOVED);
                        return browser.bookmarks.removeTree(n.external_id);
                    }
                    catch (e) {
                        console.error(e);
                    }
                }));

                return Promise.all(externalEndpoints.map(n => {
                    try {
                        this.lockUIBookmarks(n.external_id, CATEGORY_REMOVED);
                        return browser.bookmarks.remove(n.external_id);
                    }
                    catch (e) {
                        console.error(e);
                    }
                }));
            });
    }

    async updateBookmark(node) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        this.lockUIBookmarks(node.external_id, CATEGORY_CHANGED);
        return this._withMutedListeners(async () => browser.bookmarks.update(node.external_id, {
            title: node.name,
            url: node.uri
        }));
    }

    async reorderBookmarks(nodes) {
        if (!settings.show_firefox_bookmarks() || await this.isLockedByListeners())
            return;

        nodes = nodes.filter(n => n.external === BROWSER_EXTERNAL_TYPE && n.external_id);

        if (nodes.length)
            return this._withMutedListeners(async () => {
                for (let n of nodes) {
                    this.lockUIBookmarks(n.external_id, CATEGORY_MOVED);
                    await browser.bookmarks.move(n.external_id, {index: n.pos});
                }
            });
    }

    static async onBookmarkCreated(id, bookmark) {
        if (!settings.show_firefox_bookmarks() || this.isLockedByUI(id, CATEGORY_ADDED))
            return;

        this.getListenerLock();

        try {
            let parent = await ExternalNode.get(bookmark.parentId, BROWSER_EXTERNAL_TYPE);
            if (parent) {
                let node = this._convertBookmark(bookmark, parent);
                node = await Node.add(node);

                if (node.type !== NODE_TYPE_SEPARATOR)
                    await Bookmark.storeIconFromURI(node);

                if (node.type === NODE_TYPE_BOOKMARK && !settings.do_not_switch_to_ff_bookmark()
                        && !bookmark.url?.startsWith(createScrapyardToolbarReference()))
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
            let node = await ExternalNode.get(id, BROWSER_EXTERNAL_TYPE);
            if (node) {
                await Bookmark.delete([node.id]);
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
            let node = await ExternalNode.get(id, BROWSER_EXTERNAL_TYPE);
            if (node) {
                node.uri = bookmark.url;
                node.name = bookmark.title;
                node = await Node.update(node);
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
            let parent = await ExternalNode.get(bookmark.parentId, BROWSER_EXTERNAL_TYPE);

            if (parent) {
                let browserBookmarks = await browser.bookmarks.getChildren(bookmark.parentId);
                let dbBookmarks = [];
                let updatedNode;

                for (let browserBookmark of browserBookmarks) {
                    let dbBookmark = await ExternalNode.get(browserBookmark.id, BROWSER_EXTERNAL_TYPE);

                    if (dbBookmark) {
                        if (browserBookmark.id === id) {
                            updatedNode = dbBookmark;
                            dbBookmark.parent_id = parent.id;
                        }

                        dbBookmark.pos = browserBookmark.index;
                        dbBookmarks.push(dbBookmark);
                    }
                }

                await Bookmark.reorder(dbBookmarks);

                if (updatedNode)
                    await Node.update(updatedNode);

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

    // checks if UI operation wants to mute browser bookmark listeners to avoid bookmark duplication
    isLockedByUI(bookmarkId, category) {
        return !!this._uiSemaphore || this._uiBookmarks[category].some(id => id === bookmarkId);
    }

    getListenerLock() {
        this._listenerSemaphore += 1;
    }

    releaseListenerLock() {
        this._listenerSemaphore -= 1;
    }

    // used to mute the calls of this class methods that may be invoked by bookmarkManager methods used in listeners
    async isLockedByListeners() {
        if (this._isUIContext())
            return send.getListenerLockState();

        return !!this._listenerSemaphore;
    }

    async _withMutedListeners(f) {
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

    async saveFirefoxBookmarkFolderNames() {
        const bookmarkMenu = await ExternalNode.get(FIREFOX_BOOKMARK_MENU, BROWSER_EXTERNAL_TYPE);
        if (bookmarkMenu)
            Path.storeSubstitute("@", BROWSER_SHELF_NAME + "/" + bookmarkMenu.name);

        const unfiledMenu = await ExternalNode.get(FIREFOX_BOOKMARK_UNFILED, BROWSER_EXTERNAL_TYPE);
        if (unfiledMenu)
            Path.storeSubstitute("@@", BROWSER_SHELF_NAME + "/" + unfiledMenu.name);
    }

    // should only be called in the background script through message
    async reconcileBrowserBookmarksDB() {
        let iconsToGet = [];
        let browserIds = [];
        let dbPool = new Map();

        let reconcile = async (databaseNode, bookmark) => { // node, bookmark
            for (let browserNode of bookmark.children) {
                browserIds.push(browserNode.id);

                let node = dbPool.get(browserNode.id);
                if (node) {
                    if (node.name !== browserNode.title
                        || node.uri !== browserNode.url
                        || node.pos !== browserNode.index
                        || node.parent_id !== databaseNode.id) {

                        node.name = browserNode.title;
                        node.uri = browserNode.url;
                        node.pos = browserNode.index;
                        node.parent_id = databaseNode.id;
                        await Node.update(node);
                    }
                }
                else {
                    node = this._convertBookmark(browserNode, databaseNode);
                    node = await Node.add(node);

                    if (node.type === NODE_TYPE_BOOKMARK && node.uri)
                        iconsToGet.push([node.id, node.uri])
                }

                if (browserNode.type === "folder" || browserNode.children)
                    await reconcile(node, browserNode);
            }
        };

        if (settings.show_firefox_bookmarks()) {
            let beginTime = new Date().getTime();

            this.removeBrowserListeners();

            let dbRoot = await Node.get(BROWSER_SHELF_ID);
            if (!dbRoot) {
                const node = this.newBrowserRootNode();
                Node.resetDates(node);
                dbRoot = await Node.import(node);
                send.shelvesChanged();
            }
            else {
                if (dbRoot.name === "firefox") {
                    const nodes = await Shelf.listContent("firefox");
                    await Node.batchUpdate(n => n.external = BROWSER_EXTERNAL_TYPE, nodes.map(n => n.id));
                    dbRoot.name = BROWSER_SHELF_NAME;
                    dbRoot.external = BROWSER_EXTERNAL_TYPE;
                    Node.update(dbRoot);
                }
            }

            let [browserRoot] = await browser.bookmarks.getTree();

            dbPool = new Map((await ExternalNode.get(BROWSER_EXTERNAL_TYPE)).map(n => [n.external_id, n]));

            try {
                await reconcile(dbRoot, browserRoot);
                browserRoot = null;
                dbPool = null;

                await this.saveFirefoxBookmarkFolderNames();

                await ExternalNode.deleteMissingIn(browserIds, BROWSER_EXTERNAL_TYPE);

                send.externalNodesReady();

                for (const tuple of iconsToGet) {
                    const node = await Node.get(tuple[0]);
                    await Bookmark.storeIconFromURI(node);
                }

                if (iconsToGet.length)
                    setTimeout(() => send.externalNodesReady(), 500);

                this.installBrowserListeners();
                //console.log("reconciliation time: " + ((new Date().getTime() - beginTime) / 1000) + "s");
            }
            catch (e) {
                console.error(e);
            }
        }
        else {
            this.removeBrowserListeners();
            await ExternalNode.delete(BROWSER_EXTERNAL_TYPE);
            send.shelvesChanged();
        }
    }

}

export let browserShelf = new BrowserShelfPlugin();
