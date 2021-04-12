import {settings} from "./settings.js";
import {getFavicon, showNotification} from "./utils.js";
import {dropboxBackend} from "./backend_dropbox.js";
import {backend} from "./backend.js";
import {
    CLOUD_EXTERNAL_NAME,
    CLOUD_SHELF_ID,
    CLOUD_SHELF_NAME,
    NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_GROUP, NODE_TYPE_NOTES, NODE_TYPE_SHELF,
    isContainer
} from "./storage_constants.js";

const CLOUD_ERROR_MESSAGE = "Error accessing cloud.";


export let cloudBackend;


export class CloudBackend {
    constructor(provider) {
        switch (provider) {
            default:
                this._provider = dropboxBackend;
                this.getLastModified = () => this._provider.getLastModified();
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
        let db = await this._provider.getDB();

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
            let db = await this._provider.getDB();
            await f(db);
            await this._provider.persistDB(db);
        }
        catch (e) {
            console.log(e);
            if (fe) fe(e);
        }
    }

    async authenticate(signin = true) {
        return this._provider.authenticate(signin);
    }

    isAuthenticated() {
        return this._provider.isAuthenticated();
    }

    async cleanBookmarkAssets(db, node) {
        if (node.has_notes)
            await db.deleteNotes(node);

        if (node.has_comments)
            await db.deleteComments(node);

        if (node.type === NODE_TYPE_ARCHIVE)
            await db.deleteData(node);

        if (node.stored_icon)
            await db.deleteIcon(node);
    }

    async deleteBookmarks(nodes) {
        if (!settings.cloud_enabled())
            return;

        let cloud_nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (cloud_nodes.length)
            return this.withCloudDB(async db => {
                for (let node of cloud_nodes)
                    await this.cleanBookmarkAssets(db, node);

                return db.deleteNodes(cloud_nodes);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async renameBookmark(node) {
        if (settings.cloud_enabled() && node.external === CLOUD_EXTERNAL_NAME) {
            return this.withCloudDB(async db => {
                let cloud_node = await db.getNode(node.uuid, true);
                cloud_node.name = node.name;
                await db.updateNode(cloud_node);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
    }

    async updateBookmark(node) {
        if (settings.cloud_enabled() && node.external === CLOUD_EXTERNAL_NAME) {
            return this.withCloudDB(async db => {
                return db.updateNode(node);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
    }

    async updateBookmarks(nodes) {
        if (!settings.cloud_enabled())
            return;

        let cloud_nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (cloud_nodes.length) {
            return this.withCloudDB(async db => {
                for (let node of cloud_nodes) {
                    await db.updateNode(node);
                }
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
                        await this._storeNotesInternal(db, bookmark, notes.content, notes.format, notes.align);
                }

                if (node.has_comments) {
                    let comments = await backend.fetchComments(node.id);
                    if (comments)
                        await this._storeCommentsInternal(bookmark, comments);
                }

                if (node.type === NODE_TYPE_ARCHIVE) {
                    let blob = await backend.fetchBlob(node.id);
                    if (blob) {
                        if (blob.byte_length) {
                            blob.data = backend.blob2Array(blob);
                        }
                        await this._storeDataInternal(db, bookmark, blob.data, blob.type);
                    }
                }

                if (node.stored_icon) {
                    const icon = await backend.fetchIcon(node.id);
                    await db.storeIcon(bookmark, icon);
                }
            }
            catch (e) {
                console.log(e);
            }
        });
    }

    async _storeNotesInternal(db, node, notes, format, align) {
        let cloud_node = await db.getNode(node.uuid, true);
        cloud_node.has_notes = !!notes;
        cloud_node.notes_format = format;
        cloud_node.notes_align = align;
        cloud_node = await db.updateNode(cloud_node);

        return db.storeNotes(cloud_node, notes);
    }

    async _storeCommentsInternal(node, comments) {
        let db = await this._provider.getDB(true);
        return db.storeComments(node, comments);
    }

    async storeBookmarkNotes(node_id, notes, format, align) {
        if (!settings.cloud_enabled())
            return;

        let node = await backend.getNode(node_id);

        if (node.external === CLOUD_EXTERNAL_NAME)
            await this.withCloudDB(async db => {
                return this._storeNotesInternal(db, node, notes, format, align);
            });
    }

    async storeBookmarkComments(node_id, comments) {
        if (!settings.cloud_enabled())
            return;

        let node = await backend.getNode(node_id);

        if (node.external === CLOUD_EXTERNAL_NAME)
            return this._storeCommentsInternal(node, comments);
    }

    async fetchCloudNotes(node) {
        return (await this._provider.getDB(true)).fetchNotes(node);
    }

    async fetchCloudComments(node) {
        return (await this._provider.getDB(true)).fetchComments(node);
    }

    _fixUTF8Encoding(html) {
        const meta_rx = /<meta\s*charset=['"]?([^'"\/>]+)['"]?\s*\/?>/i
        const content_type_rx =
            /<meta\s*http-equiv=["']?content-type["']?\s*content=["']text\/html;\s*charset=([^'"/>]+)['"]\s*\/?>/i

        let proceed = null;

        let m = html.match(meta_rx);

        if (m && m[1] && m[1].toUpperCase() === "UTF-8")
            proceed = "utf-8";
        else if (m && m[1])
            proceed = "meta";

        if (!proceed) {
            m = html.match(content_type_rx);

            if (m && m[1] && m[1].toUpperCase() === "UTF-8")
                proceed = "utf-8";
            else if (m && m[1])
                proceed = "content-type";
        }

        if (proceed == "meta") {
            html = html.replace(meta_rx, "");
            html = html.replace("<head>", '<head><meta charset="utf-8"/>');
        }
        else if (proceed == "content-type") {
            html = html.replace(content_type_rx, "");
            html = html.replace("<head>", '<head><meta charset="utf-8"/>');
        }
        else if (proceed === null) {
            html = html.replace("<head>", '<head><meta charset="utf-8"/>');
        }

        return html;
    }

    async _storeDataInternal(db, node, data, content_type) {
        let cloud_node = await db.getNode(node.uuid, true);

        if (typeof data === "string")
            data = new TextEncoder().encode(this._fixUTF8Encoding(data));
        else
            cloud_node.byte_length = data.byteLength;

        cloud_node.content_type = content_type;
        cloud_node = await db.updateNode(cloud_node);

        return db.storeData(cloud_node, new Blob([data], {type: content_type}));
    }

    async storeBookmarkData(node_id, data, content_type) {
        if (!settings.cloud_enabled())
            return;

        let node = await backend.getNode(node_id);

        if (node.external === CLOUD_EXTERNAL_NAME)
            await this.withCloudDB(async db => {
                return this._storeDataInternal(db, node, data, content_type);
            });
    }

    async fetchCloudData(node) {
        return (await this._provider.getDB(true)).fetchData(node);
    }

    async fetchCloudIcon(node) {
        return (await this._provider.getDB(true)).fetchIcon(node);
    }

    async createBookmark(node, parent) {
        if (!settings.cloud_enabled())
            return;

        if (parent.external === CLOUD_EXTERNAL_NAME) {
            await this.withCloudDB(async db => {
                return this._createBookmarkInternal(db, node, parent.external_id);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
    }

    async createBookmarkFolder(node, parent) {
        if (!settings.cloud_enabled())
            return;

        if (typeof parent !== "object")
            parent = await backend.getNode(parent);

        if (parent && parent.external === CLOUD_EXTERNAL_NAME) {
            return this.createBookmark(node, parent);
        }
    }

    async moveBookmarks(nodes, dest_id) {
        if (!settings.cloud_enabled())
            return;

        let dest = await backend.getNode(dest_id);
        let cloud_nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);
        let other_nodes = nodes.filter(n => n.external !== CLOUD_EXTERNAL_NAME);

        if (dest.external !== CLOUD_EXTERNAL_NAME && !cloud_nodes.length)
            return;

        return this.withCloudDB(async db => {
            if (dest.external === CLOUD_EXTERNAL_NAME) {
                await Promise.all(cloud_nodes.map(n => db.moveNode(n, dest, this.newCloudRootNode())));

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

                                    await this.cleanBookmarkAssets(db, node);
                                }
                                return db.deleteNodes(n);
                            });
                        }
                        else {
                            await this.cleanBookmarkAssets(db, n);
                            return db.deleteNodes(n);
                        }
                    }
                    catch (e) {
                        console.log(e);
                    }
                }));
            }

        }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async copyBookmarks(nodes, dest_id) {
        if (!settings.cloud_enabled())
            return;

        let dest = await backend.getNode(dest_id);
        let cloud_nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (dest.external !== CLOUD_EXTERNAL_NAME && !cloud_nodes.length)
            return;

        if (dest.external === CLOUD_EXTERNAL_NAME) {
            return this.withCloudDB(async db => {
                for (let n of nodes) {
                    if (isContainer(n)) {
                        await backend.traverse(n, (parent, node) =>
                            this._createBookmarkInternal(db, node, parent ? parent.external_id : dest.external_id));
                    } else
                        await this._createBookmarkInternal(db, n, dest.external_id)
                }
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
        else {
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
    }

    async reorderBookmarks(nodes) {
        if (!settings.cloud_enabled())
            return;

        nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (nodes.length) {
            return this.withCloudDB(async db => {
                for (let n of nodes) {
                    await db.updateNode({uuid: n.uuid, pos: n.pos}, true);
                }
            });
        }
    }

    // should only be called in the background script through message
    async reconcileCloudBookmarksDB(verbose) {
        let cloud_ids = [];
        let begin_time = new Date().getTime();
        let db_pool = new Map();
        let download_icons = [];
        let download_notes = [];
        let download_comments = [];
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

                            if (cc.has_comments)
                                download_comments.push(node);

                            if (!node.icon || node.icon && node.stored_icon)
                                download_icons.push(node);

                            await backend.updateNode(node);
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
                    node = await backend.addNode(cc, false, true, false);

                    if (cc.type === NODE_TYPE_NOTES || cc.has_notes) {
                        node.notes_format = cc.notes_format;
                        node.notes_align = cc.notes_align;
                        download_notes.push(node);
                    }

                    if (cc.has_comments)
                        download_comments.push(node);

                    if (cc.type === NODE_TYPE_ARCHIVE) {
                        node.content_type = cc.content_type;
                        node.byte_length = cc.byte_length;
                        download_data.push(node);
                    }

                    if (!node.icon || node.icon && node.stored_icon)
                        download_icons.push(node);
                    else if ((node.type === NODE_TYPE_ARCHIVE || node.type === NODE_TYPE_BOOKMARK) && node.icon) {
                        await backend.storeIcon(node);
                    }
                }

                if (cc.type === NODE_TYPE_GROUP)
                    await reconcile(node, cc);
            }
        };

        if (settings.cloud_enabled()) {
            let db_root = await backend.getNode(CLOUD_SHELF_ID);
            if (!db_root) {
                db_root = await backend.addNode(this.newCloudRootNode(), false, true, false);
                try {await browser.runtime.sendMessage({type: "SHELVES_CHANGED"})} catch (e) {console.log(e)}
            }

            let cloud_last_modified = await this.getLastModified();

            if (db_root.date_modified && cloud_last_modified
                && db_root.date_modified.getTime() === cloud_last_modified.getTime())
                return;

            let cloud_root = await this.getTree();

            if (!cloud_root)
                return;

            browser.runtime.sendMessage({type: "CLOUD_SYNC_START"});

            db_pool = new Map((await backend.getExternalNodes(CLOUD_EXTERNAL_NAME)).map(n => [n.external_id, n]));

            await reconcile(db_root, cloud_root).then(async () => {
                cloud_root = null;
                db_pool = null;

                await backend.deleteMissingExternalNodes(cloud_ids, CLOUD_EXTERNAL_NAME);

                console.log("cloud reconciliation time: " + ((new Date().getTime() - begin_time) / 1000) + "s");

                for (let notes_node of download_notes) {
                    let notes = await this.fetchCloudNotes(notes_node);
                    if (notes)
                        await backend.storeNotesLowLevel(notes_node.id, notes, notes_node.notes_format, notes_node.notes_align);
                }

                for (let comments_node of download_comments) {
                    let comments = await this.fetchCloudComments(comments_node);
                    if (comments)
                        await backend.storeCommentsLowLevel(comments_node.id, comments);
                }

                for (let archive of download_data) {
                    let data = await this.fetchCloudData(archive);

                    if (data) {
                        await backend.storeBlobLowLevel(archive.id, data, archive.content_type, archive.byte_length);

                        if (!archive.byte_length)
                            await backend.storeIndex(archive.id, data.indexWords());
                    }
                }

                for (let node of download_icons) {
                    if (!node.icon && node.uri) {
                        try {
                            const icon = await getFavicon(node.uri);
                            if (icon && typeof icon === "string") {
                                node.icon = icon;
                                await backend.storeIcon(node);
                            } else if (icon) {
                                node.icon = icon.url;
                                await backend.storeIcon(node, icon.response, icon.type);
                            }
                            if (icon)
                                await backend.updateNode(node);
                        } catch (e) {
                            console.log(e);
                        }
                    }
                    else if (node.icon && node.stored_icon) {
                        const icon = await this.fetchCloudIcon(node);
                        await backend.storeIconLowLevel(node.id, icon);
                    }
                }

                db_root.date_modified = cloud_last_modified;
                await backend.updateNode(db_root, false);

                browser.runtime.sendMessage({type: "CLOUD_SYNC_END"});
                browser.runtime.sendMessage({type: "EXTERNAL_NODES_READY"});
            }).catch(e => console.error(e));
        }
        else {
            await backend.deleteExternalNodes(null, CLOUD_EXTERNAL_NAME);
            browser.runtime.sendMessage({type: "SHELVES_CHANGED"});
        }
    }
}

CloudBackend.init();
