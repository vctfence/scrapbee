import {send} from "./proxy.js";
import {settings} from "./settings.js";
import {dropboxBackend} from "./backend_dropbox.js";
import {
    CLOUD_EXTERNAL_NAME,
    CLOUD_SHELF_ID,
    CLOUD_SHELF_NAME,
    NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_GROUP, NODE_TYPE_SHELF,
    isContainer, CLOUD_SHELF_UUID
} from "./storage.js";
import {CONTEXT_BACKGROUND, getContextType, showNotification} from "./utils_browser.js";
import {ExternalNode} from "./storage_node_external.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Archive, Node} from "./storage_entities.js";
import {MarshallerCloud, UnmarshallerCloud} from "./marshaller_cloud.js";
import {ProgressCounter} from "./utils.js";

const CLOUD_SYNC_ALARM_NAME = "cloud-sync-alarm";
const CLOUD_SYNC_ALARM_PERIOD = 15;

export const CLOUD_ERROR_MESSAGE = "Error accessing cloud.";

export class CloudBackend {
    constructor() {
    }

    initialize() {
        this._provider = dropboxBackend;
        this._provider.initialize();
        this._marshaller = new MarshallerCloud();
        this._unmarshaller = new UnmarshallerCloud();
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

    getRemoteLastModified() {
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

    authenticate(signin = true) {
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
    }

    async createBookmarkFolder(node, parent) {
        if (settings.cloud_enabled())
            return this.createBookmark(node, parent);
    }

    async createBookmark(node, parent) {
        if (settings.cloud_enabled())
            await this.withCloudDB(async db => await this._createBookmarkInternal(db, node, parent),
                 e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async _createBookmarkInternal(db, node, parent) {
        try {
            node.external = CLOUD_EXTERNAL_NAME;
            node.external_id = node.uuid;
            await Node.update(node);

            await this._marshaller.marshalContent(db, node, parent);
        }
        catch (e) {
            console.error(e);
        }
    }

    async renameBookmark(node) {
        if (settings.cloud_enabled()) {
            return this.withCloudDB(async db => {
                let cloudNode = db.getNode(node.uuid);
                cloudNode.name = node.name;
                cloudNode.date_modified = Date.now();
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
    }

    async moveBookmarks(dest, nodes) {
        if (!settings.cloud_enabled())
            return;

        let cloudNodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);
        let otherNodes = nodes.filter(n => n.external !== CLOUD_EXTERNAL_NAME);

        return this.withCloudDB(async db => {
            if (dest.external === CLOUD_EXTERNAL_NAME) {
                await Promise.all(cloudNodes.map(n => db.moveNode(n, dest)));

                return Promise.all(otherNodes.map(n => {
                    if (isContainer(n)) {
                        return Bookmark.traverse(n, (parent, node) =>
                            this._createBookmarkInternal(db, node, parent || dest));
                    }
                    else
                        return this._createBookmarkInternal(db, n, dest)
                }));
            } else {
                return Promise.all(cloudNodes.map(async n => {
                    n.external = undefined;
                    n.external_id = undefined;
                    await Node.update(n);

                    try {
                        if (isContainer(n)) {
                            await Bookmark.traverse(n, async (parent, node) => {
                                if (parent) {
                                    node.external = undefined;
                                    node.external_id = undefined;
                                    await Node.update(node);

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

    async copyBookmarks(dest, nodes) {
        if (!settings.cloud_enabled())
            return;

        let cloudNodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (dest.external === CLOUD_EXTERNAL_NAME) {
            return this.withCloudDB(async db => {
                for (let n of nodes) {
                    if (isContainer(n)) {
                        await Bookmark.traverse(n, (parent, node) =>
                            this._createBookmarkInternal(db, node, parent || dest));
                    } else
                        await this._createBookmarkInternal(db, n, dest)
                }
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
        else {
            return Promise.all(cloudNodes.map(async n => {
                n.external = undefined;
                n.external_id = undefined;
                await Node.update(n);

                try {
                    if (isContainer(n)) {
                        await Bookmark.traverse(n, async (parent, node) => {
                            if (parent) {
                                node.external = undefined;
                                node.external_id = undefined;
                                await Node.update(node);
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

    async updateBookmark(node) {
        if (settings.cloud_enabled())
            return this.withCloudDB(async db => this._marshaller.marshalNodeUpdate(db, node),
                e => showNotification(CLOUD_ERROR_MESSAGE));
    }

    async updateBookmarks(nodes) {
        if (!settings.cloud_enabled())
            return;

        let cloudNodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME);

        if (cloudNodes.length) {
            return this.withCloudDB(async db => {
                for (let node of cloudNodes)
                    await this._marshaller.marshalNodeUpdate(db, node);
            }, e => showNotification(CLOUD_ERROR_MESSAGE));
        }
    }

    async reorderBookmarks(nodes) {
        if (!settings.cloud_enabled())
            return;

        nodes = nodes.filter(n => n.external === CLOUD_EXTERNAL_NAME && n.external_id);

        if (nodes.length) {
            return this.withCloudDB(async db => {
                const now = Date.now();
                for (let n of nodes) {
                    await db.updateNode({uuid: n.uuid, pos: n.pos, date_modified: now});
                }
            });
        }
    }

    async storeBookmarkNotes(node, options, propertyChange) {
        if (settings.cloud_enabled())
            await this.withCloudDB(async db => this._marshaller.marshalNotes(db, node, options));
    }

    async storeBookmarkComments(node, comments) {
        if (settings.cloud_enabled())
            await this.withCloudDB(async db => this._marshaller.marshalComments(db, node, comments));
    }

    async storeBookmarkData(node, data, contentType) {
        if (settings.cloud_enabled())
            await this.withCloudDB(async db => this._storeDataInternal(db, node, data, contentType));
    }

    async updateBookmarkData(node, data) {
        if (settings.cloud_enabled())
            await this.withCloudDB(async db => this._storeDataInternal(db, node, data));
    }

    async _storeDataInternal(db, node, data, contentType) {
        const archive = Archive.compose(data, contentType);
        return this._marshaller.marshalArchive(db, node, archive);
    }

    async _isRemoteDBModified(cloudShelf) {
        const remoteLastModified = await this.getRemoteLastModified();

        const modified = cloudShelf.date_modified?.getTime() !== remoteLastModified?.getTime();

        if (modified) {
            cloudShelf.date_modified = remoteLastModified;
            await Node.update(cloudShelf, false);
        }

        return modified;
    }

    // should only be called in the background script through message
    async reconcileCloudBookmarksDB(verbose) {
        await settings.load();

        if (settings.cloud_enabled()) {
            // TODO: remove in the next version
            if (!settings.using_cloud_v1() && await this._provider.isCloudV0Present()) {
                send.cloudShelfFormatChanged();
                return;
            }
            else if (!settings.using_cloud_v1())
                settings.using_cloud_v1(true);

            let beginTime = Date.now();
            let cloudShelf = await Node.get(CLOUD_SHELF_ID);

            if (!cloudShelf) {
                const node = this.newCloudRootNode();
                Node.resetDates(node);
                cloudShelf = await Node.import(node);
                try {await send.shelvesChanged()} catch (e) {console.error(e)}
            }

           if (!await this._isRemoteDBModified(cloudShelf))
               return;

            send.cloudSyncStart();

            const remoteDB = await this._provider.getDB();
            let remoteIDs = remoteDB.nodes.map(n => n.external_id);

            try {
                await ExternalNode.deleteMissingIn(remoteIDs, CLOUD_EXTERNAL_NAME);

                const objects = remoteDB.objects;
                const progressCounter = new ProgressCounter(objects.length, "cloudSyncProgress");
                for (const object of objects)
                    try {
                        await this._unmarshaller.unmarshal(remoteDB, object);
                        progressCounter.incrementAndNotify();
                    }
                    catch (e) {
                        console.error(e);
                    }
                progressCounter.finish();

                console.log("cloud reconciliation time: " + ((new Date().getTime() - beginTime) / 1000) + "s");

                send.cloudSyncEnd();
                send.externalNodesReady();
            }
            catch (e) {
                console.error(e);
            }
        }
        else {
            await ExternalNode.delete(CLOUD_EXTERNAL_NAME);
            send.shelvesChanged();
        }
    }

    async enableBackgroundSync(enable) {
        if (enable) {
            const alarm = await browser.alarms.get(CLOUD_SYNC_ALARM_NAME);
            if (!alarm)
                browser.alarms.create(CLOUD_SYNC_ALARM_NAME, {periodInMinutes: CLOUD_SYNC_ALARM_PERIOD});
        }
        else {
            browser.alarms.clear(CLOUD_SYNC_ALARM_NAME);
        }
    }
}

export let cloudBackend = new CloudBackend();

if (getContextType() === CONTEXT_BACKGROUND) {
    browser.alarms.onAlarm.addListener(alarm => {
        if (alarm.name === CLOUD_SYNC_ALARM_NAME)
            cloudBackend.reconcileCloudBookmarksDB();
    });
}
