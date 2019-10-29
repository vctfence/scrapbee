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
    FIREFOX_SHELF_ID,
    FIREFOX_SHELF_NAME,
    FIREFOX_SHELF_UUID,
    isContainer,
    isEndpoint,
    CLOUD_EXTERNAL_NAME,
    CLOUD_SHELF_ID,
    CLOUD_SHELF_NAME,
    JSONStorage,
    NODE_TYPE_NOTES,
    EVERYTHING, FIREFOX_BOOKMARK_MENU, FIREFOX_BOOKMARK_UNFILED
} from "./db.js"

import Storage from "./db.js"
import {getFavicon, readBlob, showNotification} from "./utils.js";
import {dropbox} from "./lib/dropbox.js"

export let backend;
export let browserBackend;
export let cloudBackend;
export let dropboxBackend;

const DROPBOX_APP_PATH = "/Apps/Scrapyard";
const DROPBOX_INDEX_PATH = "/Apps/Scrapyard/index.json";

export class DropboxBackend {
    constructor() {
        this.APP_KEY = "986piotqb77feik";

        this.auth_handler = auth_url => new Promise(async (resolve, reject) => {
            let dropbox_tab = await browser.tabs.create({url: auth_url});
            let listener = async (id, changed, tab) => {
                if (id === dropbox_tab.id) {
                    if (changed.url && !changed.url.includes("dropbox.com")) {
                        await browser.tabs.onUpdated.removeListener(listener);
                        browser.tabs.remove(dropbox_tab.id);
                        resolve(changed.url);
                    }
                }
            };
            browser.tabs.onUpdated.addListener(listener);
        });

        this.token_store = function(key, val) {
            return arguments.length > 1
                ? settings[`dropbox_${key}`](val)
                : settings[`dropbox_${key}`]();
        };

        dropbox.setTokenStore(this.token_store);
    }

    isAuthenticated() {
        return !!settings["dropbox___dbat"]();
    }

    async authenticate(signin = true) {
        if (signin)
            return dropbox.authenticate({client_id: this.APP_KEY,
                redirect_uri: "https://gchristensen.github.io/scrapyard/",
                auth_handler: this.auth_handler});
        else
            settings["dropbox___dbat"](null);
    }

    async upload(path, filename, content, reentry) {
        await this.authenticate();
        return dropbox('files/upload', {
            "path": path + filename.replace(/[\\\/:*?"<>|\[\]()^#%&!@:+={}'~]/g, "_"),
            "mode": "add",
            "autorename": true,
            "mute": false,
            "strict_conflict": false
        }, content).then(o => null /*console.log(o)*/)
            .catch(xhr => {
                if (!reentry && xhr.status >= 400 && xhr.status < 500) {
                    this.token_store("__dbat", "");
                    return this.upload(filename, content, true);
                }
            })
    };

    async getDB(blank = false) {
        let storage = null;

        if (!blank)
            try {
                let [_, blob] = await dropbox('files/download', {
                    "path": DROPBOX_INDEX_PATH
                });

                storage = JSONStorage.fromJSON(await readBlob(blob));
            }
            catch (e) {
                if (e.status === 409 && e.statusText.startsWith("path/not_found"))
                    storage = new JSONStorage({cloud: "Scrapyard"});
                else
                    console.log(e);
            }
        else
            storage = new JSONStorage({cloud: "Scrapyard"});

        if (storage) {
            storage.storeNotes = async (node, notes) => {
                try {
                    await dropbox('files/upload', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.notes`,
                        "mode": "overwrite",
                        "mute": true
                    }, notes);
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.fetchNotes = async (node) => {
                try {
                    let [_, blob] = await dropbox('files/download', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.notes`,
                    });

                    return readBlob(blob);
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.deleteNotes = async (node) => {
                try {
                    await dropbox('files/delete_v2', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.notes`
                    });
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.storeData = async (node, data) => {
                try {
                    await dropbox('files/upload', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.data`,
                        "mode": "overwrite",
                        "mute": true
                    }, data);
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.fetchData = async (node) => {
                try {
                    let [_, blob] = await dropbox('files/download', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.data`,
                    });

                    return readBlob(blob, node.byte_length? "binary": "string");
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.deleteData = async (node) => {
                try {
                    await dropbox('files/delete_v2', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.data`
                    });
                }
                catch (e) {
                    console.log(e);
                }
            };
        }

        return storage;
    }

    async persistDB(db) {
        return dropbox('files/upload', {
            "path": DROPBOX_INDEX_PATH,
            "mode": "overwrite",
            "mute": true
        }, db.serialize())
    }

    async getLastModified() {
        try {
            let meta = await dropbox("files/get_metadata", {
                "path": DROPBOX_INDEX_PATH
            });

            if (meta && meta.server_modified)
                return new Date(meta.server_modified);
        }
        catch (e) {
            console.log(e);
        }
    }
}

dropboxBackend = new DropboxBackend();


const CLOUD_ERROR_MESSAGE = "Error accessing cloud.";

export class CloudBackend {
    constructor(provider) {
        switch (provider) {
            default:
                this._backend = dropboxBackend;
                this.getLastModified = this._backend.getLastModified;
        }
    }

    static init() {
        cloudBackend = new CloudBackend("dropbox");
    }

    newCloudRootNode() {
        return {id: CLOUD_SHELF_ID,
            pos: -2,
            icon: "/icons/group.svg",
            name: CLOUD_SHELF_NAME,
            uuid: CLOUD_SHELF_NAME,
            type: NODE_TYPE_SHELF,
            external: CLOUD_EXTERNAL_NAME};
    }

    async getTree(root) {
        let db = await this._backend.getDB();

        if (!db)
            return null;

        let list = await db.queryNodes();
        root = root? root: this.newCloudRootNode();

        let traverse = (root) => {
            root.children = list.filter(n => n.parent_id === root.id);

            for (let c of root.children)
                if (c.type === NODE_TYPE_GROUP)
                    traverse(c);

            return root;
        };

        return traverse(root, list);
    }

    async withCloudDB(f, fe) {
        try {
            let db = await this._backend.getDB();
            await f(db);
            await this._backend.persistDB(db);
        }
        catch (e) {
            console.log(e);
            if (fe) fe(e);
        }
    }

    async authenticate(signin = true) {
        return this._backend.authenticate(signin);
    }

    isAuthenticated() {
        return this._backend.isAuthenticated();
    }

    async deleteCloudBookmarks(nodes) {
        if (!settings.cloud_enabled())
            return;

        let cloud_nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (cloud_nodes.length)
            return this.withCloudDB(async db => {
                for (let node of cloud_nodes) {
                    if (node.has_notes)
                        await db.deleteNotes(node);

                    if (node.type === NODE_TYPE_ARCHIVE)
                        await db.deleteData(node);
                }

                return db.deleteNodes(cloud_nodes);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async renameCloudBookmark(node) {
        if (settings.cloud_enabled() && node.external === CLOUD_EXTERNAL_NAME) {
            return this.withCloudDB(async db => {
                let cloud_node = await db.getNode(node.uuid, true);
                cloud_node.name = node.name;
                await db.updateNode(cloud_node);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
    }

    async updateCloudBookmark(node) {
        if (settings.cloud_enabled() && node.external === CLOUD_EXTERNAL_NAME) {
            return this.withCloudDB(async db => {
                return db.updateNode(node);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
    }

    async _createBookmarkInternal(db, node, parent_id) {
        let parent = await db.getNode(parent_id, true);

        let cloud_node = Object.assign({}, node);

        cloud_node.parent_id = parent? parent.id: CLOUD_SHELF_ID;

        await db.addNode(cloud_node).then(async bookmark => {
            node.external = CLOUD_EXTERNAL_NAME;
            node.external_id = bookmark.uuid;
            node.uuid = bookmark.uuid;
            await backend.updateNode(node);

            try {
                if (node.has_notes) {
                    let notes = await backend.fetchNotes(node.id);
                    if (notes)
                        await this._storeNotesInternal(db, bookmark, notes.content, notes.format);
                }

                if (node.type === NODE_TYPE_ARCHIVE) {
                    let blob = await backend.fetchBlob(node.id);
                    if (blob) {
                        if (blob.byte_length) {
                            let byteArray = new Uint8Array(blob.byte_length);
                            for (let i = 0; i < blob.data.length; ++i)
                                byteArray[i] = blob.data.charCodeAt(i);

                            blob.data = byteArray;
                        }
                        await this._storeDataInternal(db, bookmark, blob.data, blob.type);
                    }
                }
            }
            catch (e) {
                console.log(e);
            }
        });
    }

    async _storeNotesInternal(db, node, notes, format) {
        let cloud_node = await db.getNode(node.uuid, true);
        cloud_node.has_notes = !!notes;
        cloud_node.notes_format = format;
        cloud_node = await db.updateNode(cloud_node);

        return db.storeNotes(cloud_node, notes);
    }

    async storeCloudNotes(node_id, notes, format) {
        if (!settings.cloud_enabled())
            return;

        let node = await backend.getNode(node_id);

        if (node.external === CLOUD_EXTERNAL_NAME)
            await this.withCloudDB(async db => {
                return this._storeNotesInternal(db, node, notes, format);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async fetchCloudNotes(node) {
        return (await this._backend.getDB(true)).fetchNotes(node);
    }

    async _storeDataInternal(db, node, data, content_type) {
        let cloud_node = await db.getNode(node.uuid, true);

        if (typeof data === "string")
            data = new TextEncoder().encode(data);
        else
            cloud_node.byte_length = data.byteLength;

        cloud_node.content_type = content_type;
        cloud_node = await db.updateNode(cloud_node);

        return db.storeData(cloud_node, new Blob([data], {type: content_type}));
    }

    async storeCloudData(node_id, data, content_type) {
        if (!settings.cloud_enabled())
            return;

        let node = await backend.getNode(node_id);

        if (node.external === CLOUD_EXTERNAL_NAME)
            await this.withCloudDB(async db => {
                return this._storeDataInternal(db, node, data, content_type);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async fetchCloudData(node) {
        return (await this._backend.getDB(true)).fetchData(node);
    }

    async createCloudBookmark(node, parent_id) {
        if (!settings.cloud_enabled())
            return;

        await this.withCloudDB(async db => {
            return this._createBookmarkInternal(db, node, parent_id);
        }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async createCloudBookmarkFolder(node, parent_id) {
        if (!settings.cloud_enabled())
            return;

        if (typeof parent_id !== "object")
            parent_id = await backend.getNode(parent_id);

        if (parent_id && parent_id.external === CLOUD_EXTERNAL_NAME) {
            return this.createCloudBookmark(node, parent_id.external_id);
        }
    }

    async moveCloudBookmarks(nodes, dest_id) {
        if (!settings.cloud_enabled())
            return;

        let dest = await backend.getNode(dest_id);
        let cloud_nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);
        let other_nodes = nodes.filter(n => n.external !== CLOUD_EXTERNAL_NAME);

        return this.withCloudDB(async db => {
            if (dest.external === CLOUD_EXTERNAL_NAME) {
                await Promise.all(cloud_nodes.map(n => db.moveNode(n, dest)));

                return Promise.all(other_nodes.map(n => {
                    if (isContainer(n)) {
                        return backend.traverse(n, (parent, node) =>
                            this._createBookmarkInternal(db, node, parent? parent.external_id: dest.external_id));
                    }
                    else
                        return this._createBookmarkInternal(db, n, dest.external_id)
                }));
            } else {
                return Promise.all(cloud_nodes.map(async n => {
                    n.external = null;
                    n.external_id = null;
                    await backend.updateNode(n);

                    try {
                        if (isContainer(n)) {
                            await backend.traverse(n, async (parent, node) => {
                                if (parent) {
                                    node.external = null;
                                    node.external_id = null;
                                    await backend.updateNode(node);
                                }
                                return db.deleteNodes(n);
                            });
                        }
                        else
                            return db.deleteNodes(n);
                    }
                    catch (e) {
                        console.log(e);
                    }
                }));
            }

        }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async copyCloudBookmarks(nodes, dest_id) {
        if (!settings.cloud_enabled())
            return;

        let dest = await backend.getNode(dest_id);
        let cloud_nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        return this.withCloudDB(async db => {
            if (dest.external === CLOUD_EXTERNAL_NAME) {
                for (let n of nodes) {
                    if (isContainer(n)) {
                        await backend.traverse(n, (parent, node) =>
                            this._createBookmarkInternal(db, node, parent ? parent.external_id : dest.external_id));
                    } else
                        await this._createBookmarkInternal(db, n, dest.external_id)
                }
            } else {
                return Promise.all(cloud_nodes.map(async n => {
                    n.external = null;
                    n.external_id = null;
                    await backend.updateNode(n);

                    try {
                        if (isContainer(n)) {
                            await backend.traverse(n, async (parent, node) => {
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

    async reorderCloudBookmarks(nodes) {
        if (!settings.cloud_enabled())
            return;

        nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        return this.withCloudDB(async db => {
            for (let n of nodes) {
                await db.updateNode({uuid: n.uuid, pos: n.pos});
            }
        }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }
}

CloudBackend.init();


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
                        return backend.traverse(n, (parent, node) =>
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
                            await backend.traverse(n, async (parent, node) => {
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
                        return backend.traverse(n, (parent, node) =>
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
                            await backend.traverse(n, async (parent, node) => {
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

                    if (node.type === NODE_TYPE_BOOKMARK && node.uri)
                        node.icon = await getFavicon(node.uri);

                    node = await backend.addNode(node);

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
                        browser.runtime.sendMessage({type: "BOOKMARK_CREATED", node: updated_node});
                    //browser.runtime.sendMessage({type: "EXTERNAL_NODE_UPDATED", node: updated_node});
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

        if (ui_context)
            await browser.runtime.sendMessage({type: "UI_LOCK_GET"});
        else
            this.getUILock();

        try {await f()} catch (e) {console.log(e);}

        if (ui_context)
            await browser.runtime.sendMessage({type: "UI_LOCK_RELEASE"});
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
}

browserBackend = new BrowserBackend();


class IDBBackend extends Storage {

    constructor() {
        super();

        settings.load(() => {
            if (settings.show_firefox_bookmarks()) {
                this.getExternalNode(FIREFOX_BOOKMARK_MENU, FIREFOX_SHELF_NAME).then(node => {
                    if (node)
                        this._browserBookmarkPath = FIREFOX_SHELF_NAME + "/" + node.name;
                });

                this.getExternalNode(FIREFOX_BOOKMARK_UNFILED, FIREFOX_SHELF_NAME).then(node => {
                    if (node)
                        this._unfiledBookmarkPath = FIREFOX_SHELF_NAME + "/" + node.name;
                });
            }
        });
    }

    expandPath(path) {
        if (path && path.startsWith("~"))
            return path.replace("~", DEFAULT_SHELF_NAME);
        else if (path && path.startsWith("@@"))
            return path.replace("@@", this._unfiledBookmarkPath);
        else if (path && path.startsWith("@"))
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
            await browserBackend.reorderBrowserBookmarks(positions);
            await cloudBackend.reorderCloudBookmarks(positions);
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

                await browserBackend.createBrowserBookmarkFolder(node, parent);
                await cloudBackend.createCloudBookmarkFolder(node, parent);

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
            await browserBackend.createBrowserBookmarkFolder(node, parent);
            await cloudBackend.createCloudBookmarkFolder(node, parent);
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

            await browserBackend.renameBrowserBookmark(group);
            await cloudBackend.renameCloudBookmark(group);

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
        await cloudBackend.moveCloudBookmarks(nodes, dest_id);

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
                        await this.storeBlobLowLevel(n.id, blob.data, blob.type);
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
        await browserBackend.copyBrowserBookmarks(original_nodes, dest_id);
        await cloudBackend.copyCloudBookmarks(original_nodes, dest_id);

        return new_nodes;
    }

    async deleteNodes(ids) {
        let all_nodes = await this.queryFullSubtree(ids);

        await browserBackend.deleteBrowserBookmarks(all_nodes);
        await cloudBackend.deleteCloudBookmarks(all_nodes);

        return super.deleteNodesLowLevel(all_nodes.map(n => n.id));
    }

    async deleteChildNodes(id) {
        let all_nodes = await this.queryFullSubtree(id);

        return super.deleteNodesLowLevel(all_nodes.map(n => n.id).filter(i => i !== id));
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
        else {
            let cloud_bookmark = group && group.external === CLOUD_EXTERNAL_NAME;

            if (!cloud_bookmark && parent && parent.external === CLOUD_EXTERNAL_NAME)
                cloud_bookmark = true;
            else if (!parent && (parent = await this.getNode(parent_id)).external === CLOUD_EXTERNAL_NAME)
                cloud_bookmark = true;

            if (cloud_bookmark) {
                if (!parent)
                    parent = await this.getNode(parent_id);

                await cloudBackend.createCloudBookmark(node, parent.external_id);
            }
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

        return this.addNode(data, false, true, false);
    }

    async updateBookmark(data) {
        let update = {};
        Object.assign(update, data);

        update.tag_list = this._splitTags(update.tags);
        this.addTags(update.tag_list);

        await browserBackend.updateBrowserBookmark(update);
        await cloudBackend.updateCloudBookmark(update);

        return this.updateNode(update);
    }

    async storeBlob(node_id, data, content_type, compress = false) {
        await super.storeBlobLowLevel(node_id, data, content_type, compress);

        cloudBackend.storeCloudData(node_id, data, content_type);
    }

    async storeNotes(node_id, notes, format) {
        await super.storeNotesLowLevel(node_id, notes, format);

        cloudBackend.storeCloudNotes(node_id, notes, format);
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
                        await this.updateNode(node);
                    }
                }
                else {
                    node = await this.addNode(browserBackend.convertBookmark(bc, d), false);

                    if (node.type === NODE_TYPE_BOOKMARK && node.uri)
                        get_icons.push([node.id, node.uri])
                }

                if (bc.type === "folder")
                    await reconcile(node, bc);
            }
        };

        if (settings.show_firefox_bookmarks()) {
            browserBackend.removeBrowserListeners();

            let db_root = await this.getNode(FIREFOX_SHELF_ID);
            if (!db_root) {
                db_root = await this.addNode(browserBackend.newBrowserRootNode(), false);
                browser.runtime.sendMessage({type: "SHELVES_CHANGED"});
            }

            let [browser_root] = await browser.bookmarks.getTree();

            db_pool = new Map((await this.getExternalNodes(FIREFOX_SHELF_NAME)).map(n => [n.external_id, n]));

            await reconcile(db_root, browser_root).then(async () => {
                browser_root = null;
                db_pool = null;

                await this.deleteMissingExternalNodes(browser_ids, FIREFOX_SHELF_NAME);

                //console.log("reconciliation time: " + ((new Date().getTime() - begin_time) / 1000) + "s");
                browser.runtime.sendMessage({type: "EXTERNAL_NODES_READY"});

                for (let item of get_icons) {
                    let node = await this.getNode(item[0]);
                    if (node) {
                        try {
                            node.icon = await getFavicon(item[1]);
                            await this.updateNode(node);
                        } catch (e) {
                            console.log(e);
                        }
                    }
                    //console.log(node.icon + " (" + item[1] + ")");
                }

                if (get_icons.length)
                    setTimeout(() => browser.runtime.sendMessage({type: "EXTERNAL_NODES_READY"}), 500);

                browserBackend.installBrowserListeners();
            });
        }
        else {
            browserBackend.removeBrowserListeners();
            await this.deleteExternalNodes(null, FIREFOX_SHELF_NAME);
            browser.runtime.sendMessage({type: "SHELVES_CHANGED"});
        }
    }

    // should only be called in the background script through message
    async reconcileCloudBookmarksDB() {
        let cloud_ids = [];
        let begin_time = new Date().getTime();
        let db_pool = new Map();
        let download_icons = [];
        let download_notes = [];
        let download_data = [];

        let reconcile = async (d, c) => { // node, cloud bookmark
            for (let cc of c.children) {
                cloud_ids.push(cc.uuid);

                let node = db_pool.get(cc.uuid);
                if (node) {
                    let node_date = node.date_modified;
                    let cloud_date = cc.date_modified;
                    try {
                        if (!(node_date instanceof Date))
                            node_date = new Date(node_date);

                        if (!(cloud_date instanceof Date))
                            cloud_date = new Date(cloud_date);

                        if (node_date.getTime() < cloud_date.getTime()) {
                            let id = node.id;
                            node = Object.assign(node, cc);
                            node.id = id;
                            node.parent_id = d.id;

                            if (cc.type === NODE_TYPE_NOTES || cc.has_notes)
                                download_notes.push(node);

                            if (!node.icon)
                                download_icons.push(node);

                            await this.updateNode(node);
                        }
                    }
                    catch (e) {
                        console.log(e);
                    }
                }
                else {
                    delete cc.id;
                    cc.parent_id = d.id;
                    cc.external = CLOUD_EXTERNAL_NAME;
                    cc.external_id = cc.uuid;
                    node = await this.addNode(cc, false, false);

                    if (cc.type === NODE_TYPE_NOTES || cc.has_notes) {
                        node.notes_format = cc.notes_format;
                        download_notes.push(node);
                    }

                    if (cc.type === NODE_TYPE_ARCHIVE) {
                        node.content_type = cc.content_type;
                        node.byte_length = cc.byte_length;
                        download_data.push(node);
                    }

                    if ((node.type === NODE_TYPE_ARCHIVE || node.type === NODE_TYPE_BOOKMARK) && !node.icon)
                        download_icons.push(node);
                }

                if (cc.type === NODE_TYPE_GROUP)
                    await reconcile(node, cc);
            }
        };

        if (settings.cloud_enabled()) {
            let db_root = await this.getNode(CLOUD_SHELF_ID);
            if (!db_root) {
                db_root = await this.addNode(cloudBackend.newCloudRootNode(), false);
                try {await browser.runtime.sendMessage({type: "SHELVES_CHANGED"})} catch (e) {console.log(e)}
            }

            let cloud_last_modified = await cloudBackend.getLastModified();

            if (db_root.date_modified && cloud_last_modified
                    && db_root.date_modified.getTime() === cloud_last_modified.getTime())
                return;

            let cloud_root = await cloudBackend.getTree();

            if (!cloud_root)
                return;

            browser.runtime.sendMessage({type: "CLOUD_SYNC_START"});

            db_pool = new Map((await this.getExternalNodes(CLOUD_EXTERNAL_NAME)).map(n => [n.external_id, n]));

            await reconcile(db_root, cloud_root).then(async () => {
                cloud_root = null;
                db_pool = null;

                await this.deleteMissingExternalNodes(cloud_ids, CLOUD_EXTERNAL_NAME);

                console.log("cloud reconciliation time: " + ((new Date().getTime() - begin_time) / 1000) + "s");

                for (let notes_node of download_notes) {
                    let notes = await cloudBackend.fetchCloudNotes(notes_node);
                    if (notes)
                        await backend.storeNotesLowLevel(notes_node.id, notes, notes_node.notes_format);
                }

                for (let archive of download_data) {
                    let data = await cloudBackend.fetchCloudData(archive);

                    if (data) {
                        await backend.storeBlobLowLevel(archive.id, data, archive.content_type);

                        if (!archive.byte_length)
                            await backend.storeIndex(archive.id, data.indexWords());
                    }
                }

                for (let node of download_icons) {
                    if (node.uri)
                        try {
                            node.icon = await getFavicon(node.uri);
                            await this.updateNode(node);
                        } catch (e) {
                            console.log(e);
                        }
                }

                db_root.date_modified = cloud_last_modified;
                await backend.updateNode(db_root, false);

                browser.runtime.sendMessage({type: "CLOUD_SYNC_END"});
                browser.runtime.sendMessage({type: "EXTERNAL_NODES_READY"});
            });
        }
        else {
            await this.deleteExternalNodes(null, CLOUD_EXTERNAL_NAME);
            browser.runtime.sendMessage({type: "SHELVES_CHANGED"});
        }
    }
}

// let backend = new HTTPBackend("http://localhost:31800", "default:default");
backend = new IDBBackend();
