import {send} from "./proxy.js";
import {settings} from "./settings.js";
import {dropboxBackend} from "./backend_dropbox.js";
import {backend} from "./backend.js";

import {
    CLOUD_EXTERNAL_NAME,
    CLOUD_SHELF_ID,
    CLOUD_SHELF_NAME,
    NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_GROUP, NODE_TYPE_SHELF,
    isContainer, CLOUD_SHELF_UUID
} from "./storage.js";
import {notes2html} from "./notes_render.js";
import {showNotification} from "./utils_browser.js";

export const CLOUD_ERROR_MESSAGE = "Error accessing cloud.";


export let cloudBackend;


export class CloudBackend {
    constructor(provider) {
        switch (provider) {
            default:
                this._provider = dropboxBackend;
        }
    }

    static init() {
        cloudBackend = new CloudBackend("dropbox");
    }

    async reset() {
        await this._provider.reset();
    }

    newCloudRootNode() {
        return {id: CLOUD_SHELF_ID,
                pos: -2,
                name: CLOUD_SHELF_NAME,
                uuid: CLOUD_SHELF_UUID,
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

    getLastModified() {
        return this._provider.getLastModified();
    }

    async withCloudDB(f, fe) {
        try {
            let db = await this._provider.getDB();
            await f(db);
            await this._provider.persistDB(db);
        }
        catch (e) {
            console.error(e);
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
        if (node.has_notes) {
            await db.deleteNotes(node);
            await db.deleteView(node);
        }

        if (node.has_comments)
            await db.deleteComments(node);

        if (node.type === NODE_TYPE_ARCHIVE)
            await db.deleteData(node);

        // if (node.stored_icon)
        //     await db.deleteIcon(node);
    }

    async deleteBookmarks(nodes) {
        if (!settings.cloud_enabled())
            return;

        let cloudNodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (cloudNodes.length)
            return this.withCloudDB(async db => {
                for (let node of cloudNodes)
                    await this.cleanBookmarkAssets(db, node);

                return db.deleteNodes(cloudNodes);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async renameBookmark(node) {
        if (settings.cloud_enabled() && node.external === CLOUD_EXTERNAL_NAME) {
            return this.withCloudDB(async db => {
                let cloudNode = await db.getNode(node.uuid, true);
                cloudNode.name = node.name;
                await db.updateNode(cloudNode);
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

        let cloudNodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (cloudNodes.length) {
            return this.withCloudDB(async db => {
                for (let node of cloudNodes) {
                    await db.updateNode(node);
                }
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
    }

    async _createBookmarkInternal(db, node, parentId) {
        let parent = await db.getNode(parentId, true);
        let cloudNode = Object.assign({}, node);

        cloudNode.parent_id = parent? parent.id: CLOUD_SHELF_ID;

        if (node.stored_icon) {
            cloudNode.icon_data = await backend.fetchIcon(node.id);
            //await db.storeIcon(bookmark, icon);
        }

        await db.addNode(cloudNode).then(async bookmark => {
            node.external = CLOUD_EXTERNAL_NAME;
            node.external_id = bookmark.uuid;
            node.uuid = bookmark.uuid;
            await backend.updateNode(node);

            try {
                if (node.has_notes) {
                    let notes = await backend.fetchNotes(node.id);
                    if (notes)
                        await this._storeNotesInternal(db, bookmark, notes);
                }

                if (node.has_comments) {
                    let comments = await backend.fetchComments(node.id);
                    if (comments)
                        await this._storeCommentsInternal(bookmark, comments);
                }

                if (node.type === NODE_TYPE_ARCHIVE) {
                    let blob = await backend.fetchBlob(node.id);
                    if (blob) {
                        const data = await backend.reifyBlob(blob);
                        await this._storeDataInternal(db, bookmark, data, blob.type);
                    }
                }
            }
            catch (e) {
                console.error(e);
            }
        });
    }

    async _storeNotesInternal(db, node, options) {
        let cloudNode = await db.getNode(node.uuid, true);

        if (options.hasOwnProperty("content"))
            cloudNode.has_notes = !!options.content;
        if (options.hasOwnProperty("format"))
            cloudNode.notes_format = options.format;
        if (options.hasOwnProperty("align"))
            cloudNode.notes_align = options.align;
        if (options.hasOwnProperty("width"))
            cloudNode.notes_width = options.width;

        cloudNode = await db.updateNode(cloudNode);

        if (options.hasOwnProperty("content")) {
            let isHtml = options.format === "html" || options.format === "delta";

            let view = `<html><head></head><body class="${isHtml ? "format-html" : ""}">${notes2html(options)}</body></html>`;

            await db.storeView(cloudNode, view);

            return db.storeNotes(cloudNode, options.content);
        }
    }

    async _storeCommentsInternal(node, comments) {
        let db = await this._provider.getDB(true);
        return db.storeComments(node, comments);
    }

    async storeBookmarkNotes(options) {
        if (!settings.cloud_enabled())
            return;

        let node = await backend.getNode(options.node_id);

        if (node.external === CLOUD_EXTERNAL_NAME)
            await this.withCloudDB(async db => {
                return this._storeNotesInternal(db, node, options);
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

    async fetchCloudView(node) {
        return (await this._provider.getDB(true)).fetchView(node);
    }

    async fetchCloudComments(node) {
        return (await this._provider.getDB(true)).fetchComments(node);
    }

    _fixUTF8Encoding(html) {
        const metaRx = /<meta\s*charset=['"]?([^'"\/>]+)['"]?\s*\/?>/ig
        const contentTypeRx =
            /<meta\s*http-equiv=["']?content-type["']?\s*content=["']text\/html;\s*charset=([^'"/>]+)['"]\s*\/?>/ig

        let proceed = null;

        let m = html.match(metaRx);

        if (m && m[1] && m[1].toUpperCase() === "UTF-8")
            proceed = "utf-8";
        else if (m && m[1])
            proceed = "meta";

        if (!proceed) {
            m = html.match(contentTypeRx);

            if (m && m[1] && m[1].toUpperCase() === "UTF-8")
                proceed = "utf-8";
            else if (m && m[1])
                proceed = "content-type";
        }

        if (proceed === "meta") {
            html = html.replace(metaRx, "");
            html = html.replace(/<head[^>]*>/ig, m => `${m}<meta charset="utf-8"/>`);
        }
        else if (proceed === "content-type") {
            html = html.replace(contentTypeRx, "");
            html = html.replace(/<head[^>]*>/ig, m => `${m}<meta charset="utf-8"/>`);
        }
        else if (proceed === null) {
            html = html.replace(/<head[^>]*>/ig, m => `${m}<meta charset="utf-8"/>`);
        }

        return html;
    }

    async _storeDataInternal(db, node, data, content_type) {
        let cloudNode = await db.getNode(node.uuid, true);

        if (typeof data === "string")
            data = new TextEncoder().encode(this._fixUTF8Encoding(data));
        else
            cloudNode.byte_length = data.byteLength;

        if (content_type)
            cloudNode.content_type = content_type;
        cloudNode = await db.updateNode(cloudNode);

        return db.storeData(cloudNode, new Blob([data], {type: content_type}));
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

    async updateBookmarkData(node_id, data, content_type) {
        if (!settings.cloud_enabled())
            return;

        let node = await backend.getNode(node_id);

        if (node.external === CLOUD_EXTERNAL_NAME)
            await this.withCloudDB(async db => {
                let node = await backend.getNode(node_id);
                return this._storeDataInternal(db, node, data, null);
            });
    }

    async fetchCloudData(node) {
        return (await this._provider.getDB(true)).fetchData(node);
    }

    // icon now is stored in the index.js
    // async fetchCloudIcon(node) {
    //     return (await this._provider.getDB(true)).fetchIcon(node);
    // }

    async createBookmark(node, parent) {
        if (!settings.cloud_enabled())
            return;

        if (parent.external === CLOUD_EXTERNAL_NAME) {
            await this.withCloudDB(async db => {
                return this._createBookmarkInternal(db, node, parent.uuid);
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
        let cloudNodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);
        let otherNodes = nodes.filter(n => n.external !== CLOUD_EXTERNAL_NAME);

        if (dest.external !== CLOUD_EXTERNAL_NAME && !cloudNodes.length)
            return;

        return this.withCloudDB(async db => {
            if (dest.external === CLOUD_EXTERNAL_NAME) {
                await Promise.all(cloudNodes.map(n => db.moveNode(n, dest, this.newCloudRootNode())));

                return Promise.all(otherNodes.map(n => {
                    if (isContainer(n)) {
                        return backend.traverse(n, (parent, node) =>
                            this._createBookmarkInternal(db, node, parent? parent.uuid: dest.uuid));
                    }
                    else
                        return this._createBookmarkInternal(db, n, dest.uuid)
                }));
            } else {
                return Promise.all(cloudNodes.map(async n => {
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
                        console.error(e);
                    }
                }));
            }

        }, e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async copyBookmarks(nodes, dest_id) {
        if (!settings.cloud_enabled())
            return;

        let dest = await backend.getNode(dest_id);
        let cloudNodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (dest.external !== CLOUD_EXTERNAL_NAME && !cloudNodes.length)
            return;

        if (dest.external === CLOUD_EXTERNAL_NAME) {
            return this.withCloudDB(async db => {
                for (let n of nodes) {
                    if (isContainer(n)) {
                        await backend.traverse(n, (parent, node) =>
                            this._createBookmarkInternal(db, node, parent ? parent.uuid : dest.uuid));
                    } else
                        await this._createBookmarkInternal(db, n, dest.uuid)
                }
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
        else {
            return Promise.all(cloudNodes.map(async n => {
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
    }

    async reorderBookmarks(nodes) {
        if (!settings.cloud_enabled())
            return;

        nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME && n.external_id);

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
        if (verbose) {
            // resolve inconsistency after the migration to the new dropbox authorization protocol
            if (settings.dropbox___dbat() && !this.isAuthenticated()) {
                showNotification("Authentication is required for the new Dropbox OAuth2 protocol.");

                let success = await this.authenticate();
                if (!success)
                    return;
            }
        }

        let cloudIds = [];
        let beginTime = Date.now();
        let dbPool = new Map();
        let downloadIcons = [];
        let downloadNotes = [];
        let downloadComments = [];
        let downloadData = [];

        let reconcile = async (d, c) => { // node, cloud bookmark
            for (let cloudNode of c.children) {
                cloudIds.push(cloudNode.uuid);

                let node = dbPool.get(cloudNode.uuid);
                if (node) {
                    let nodeDate = node.date_modified;
                    let cloudDate = cloudNode.date_modified;
                    try {
                        if (!(nodeDate instanceof Date))
                            nodeDate = new Date(nodeDate);

                        if (!(cloudDate instanceof Date))
                            cloudDate = new Date(cloudDate);

                        if (nodeDate.getTime() < cloudDate.getTime()) {
                            delete cloudNode.id;
                            delete cloudNode.parent_id;
                            delete cloudNode.icon;
                            delete cloudNode.icon_data;
                            delete cloudNode.date_added
                            node = Object.assign(node, cloudNode);

                            if (cloudNode.has_notes)
                                downloadNotes.push(node);

                            if (cloudNode.has_comments)
                                downloadComments.push(node);

                            await backend.updateNode(node);
                        }
                    }
                    catch (e) {
                        console.error(e);
                    }
                }
                else {
                    delete cloudNode.id;
                    cloudNode.parent_id = d.id;
                    cloudNode.external = CLOUD_EXTERNAL_NAME;
                    cloudNode.external_id = cloudNode.uuid;
                    cloudNode.date_added = new Date(cloudNode.date_added);
                    cloudNode.date_modified = new Date(cloudNode.date_modified);
                    node = await backend.addNode(cloudNode, false, false, false);

                    if (cloudNode.has_notes) {
                        node.notes_format = cloudNode.notes_format;
                        node.notes_align = cloudNode.notes_align;
                        downloadNotes.push(node);
                    }

                    if (cloudNode.has_comments)
                        downloadComments.push(node);

                    if (cloudNode.type === NODE_TYPE_ARCHIVE) {
                        node.content_type = cloudNode.content_type;
                        node.byte_length = cloudNode.byte_length;
                        downloadData.push(node);
                    }

                    if (!node.icon && node.uri)
                        await backend.storeIconFromURI(node);
                    else if (node.icon && !node.stored_icon)
                        await backend.storeIcon(node);
                    else if (node.icon && node.stored_icon)
                        await backend.storeIconLowLevel(node.id, cloudNode.icon_data);
                }

                if (cloudNode.type === NODE_TYPE_GROUP)
                    await reconcile(node, cloudNode);
            }
        };

        if (settings.cloud_enabled()) {
            let dbRoot = await backend.getNode(CLOUD_SHELF_ID);
            if (!dbRoot) {
                dbRoot = await backend.addNode(this.newCloudRootNode(), false, true, false);
                try {await send.shelvesChanged()} catch (e) {console.error(e)}
            }

            let cloudLastModified = await this.getLastModified();

            if (dbRoot.date_modified && cloudLastModified
                && dbRoot.date_modified.getTime() === cloudLastModified.getTime())
                return;

            let cloudRoot = await this.getTree();

            if (!cloudRoot)
                return;

            send.cloudSyncStart();

            dbPool = new Map((await backend.getExternalNodes(CLOUD_EXTERNAL_NAME)).map(n => [n.uuid, n]));

            await reconcile(dbRoot, cloudRoot).then(async () => {
                cloudRoot = null;
                dbPool = null;

                await backend.deleteMissingExternalNodes(cloudIds, CLOUD_EXTERNAL_NAME);

                for (let notesNode of downloadNotes) {
                    let notes = await this.fetchCloudNotes(notesNode);
                    if (notes) {
                        let options = {
                            node_id: notesNode.id,
                            content: notes,
                            format: notesNode.notes_format,
                            align: notesNode.notes_align,
                            width: notesNode.notes_width
                        };

                        if (notesNode.notes_format === "delta")
                            options.html = await this.fetchCloudView(notesNode);

                        await backend.storeNotesLowLevel(options);
                    }
                }

                for (let commentsNode of downloadComments) {
                    let comments = await this.fetchCloudComments(commentsNode);
                    if (comments)
                        await backend.storeCommentsLowLevel(commentsNode.id, comments);
                }

                for (let archive of downloadData) {
                    let data = await this.fetchCloudData(archive);

                    if (data) {
                        await backend.storeBlobLowLevel(archive.id, data, archive.content_type, archive.byte_length);
                    }
                }

                dbRoot.date_modified = cloudLastModified;
                await backend.updateNode(dbRoot, false);

                console.log("cloud reconciliation time: " + ((new Date().getTime() - beginTime) / 1000) + "s");

                send.cloudSyncEnd();
                send.externalNodesReady();
            }).catch(e => console.error(e));
        }
        else {
            await backend.deleteExternalNodes(CLOUD_EXTERNAL_NAME);
            send.shelvesChanged();
        }
    }

    startBackgroundSync(enable) {
        if (enable)
            this._backgroundSyncInterval = setInterval(
                () => this.reconcileCloudBookmarksDB(),
                15 * 60 * 1000);
        else if (this._backgroundSyncInterval)
            clearInterval(this._backgroundSyncInterval);
    }
}

CloudBackend.init();
