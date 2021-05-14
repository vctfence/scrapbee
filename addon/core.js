import {backend} from "./backend.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud.js";
import {nativeBackend} from "./backend_native.js";
import {ishellBackend} from "./backend_ishell.js";
import {settings} from "./settings.js";
import * as search from "./search.js";

import {formatBytes} from "./utils.js";

import {CLOUD_SHELF_ID, DEFAULT_POSITION, NODE_TYPE_GROUP, NODE_TYPE_SHELF} from "./storage_constants.js";
import {browseNode, createArchive, createBookmark, storePageHtml} from "./core_bookmarking.js";
import {
    browseNodeExternal,
    createArchiveExternal,
    createBookmarkExternal,
    getNodeExternal,
    isAutomationAllowed,
    packPageExternal,
    removeNodeExternal,
    renderPath,
    updateNodeExternal
} from "./core_external.js";
import {exportFile, importFile} from "./core_import.js";
import {backupShelf, deleteBackup, listBackups, restoreShelf} from "./core_backup.js";
import {recalculateArchiveSize, reindexArchiveContent, resetCloud} from "./core_repair.js";


/* Internal message listener */
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {

    switch (message.type) {

        case "CREATE_BOOKMARK":
            createBookmark(message.data);
            break;

        case "CREATE_ARCHIVE":
            createArchive(message.data);
            break;

        case "UPDATE_ARCHIVE":
            return backend.updateBlob(message.id, message.data);

        case "STORE_PAGE_HTML":
            storePageHtml(message);
            break;

        case "GET_BOOKMARK_INFO":
            let node = await backend.getNode(message.id);
            node.__formatted_size = node.size? formatBytes(node.size): null;
            node.__formatted_date = node.date_added
                ? node.date_added.toString().replace(/:[^:]*$/, "")
                : null;
            return node;

        case "GET_HIDE_TOOLBAR_SETTING":
            return settings.do_not_show_archive_toolbar();

        case "COPY_NODES":
            return backend.copyNodes(message.node_ids, message.dest_id);

        case "SHARE_TO_CLOUD":
            return backend.copyNodes(message.node_ids, CLOUD_SHELF_ID)
                .then(async newNodes => {
                    newNodes = newNodes.filter(n => message.node_ids.some(id => id === n.old_id));
                    for (let n of newNodes) {
                        n.pos = DEFAULT_POSITION;
                        await backend.updateNode(n);
                    }
                    await backend.updateExternalBookmarks(newNodes);
                });

        case "MOVE_NODES":
            return backend.moveNodes(message.node_ids, message.dest_id);

        case "DELETE_NODES":
            return backend.deleteNodes(message.node_ids);

        case "REORDER_NODES":
            return backend.reorderNodes(message.positions);

        case "BROWSE_NODE":
            browseNode(message.node, message.tab, message.preserveHistory, message.container);
            break;

        case "BROWSE_NOTES":
            (message.tab
                ? browser.tabs.update(message.tab.id, {
                    "url": "notes.html#" + message.uuid + ":" + message.id,
                    "loadReplace": true
                })
                : browser.tabs.create({"url": "notes.html#" + message.uuid + ":" + message.id}));
            break;

        case "BROWSE_ORG_REFERENCE":
            location.href = message.link;
            break;

        case "IMPORT_FILE":
            return importFile(message);

        case "EXPORT_FILE":
            return exportFile(message);

        case "LIST_BACKUPS":
            return listBackups(message);

        case "BACKUP_SHELF":
            return backupShelf(message);

        case "RESTORE_SHELF":
            return restoreShelf(message);

        case "DELETE_BACKUP":
            return deleteBackup(message);

        case "UI_LOCK_GET":
            browserBackend.getUILock();
            break;

        case "UI_LOCK_RELEASE":
            browserBackend.releaseUILock();
            break;

        case "GET_LISTENER_LOCK_STATE":
            return browserBackend.isListenerLocked();

        case "RECONCILE_BROWSER_BOOKMARK_DB":
            settings.load(s => {
                browserBackend.reconcileBrowserBookmarksDB();
            });
            break;
        case "RECONCILE_CLOUD_BOOKMARK_DB":
            settings.load(s => {
                cloudBackend.reconcileCloudBookmarksDB(message.verbose);
            });
            break;

        case "ENABLE_CLOUD_BACKGROUND_SYNC":
            settings.load(s => {
                startCloudBackgroundSync(s);
            });
            break;

        case "HELPER_APP_HAS_VERSION": {
            const helperApp = await nativeBackend.probe();

            if (helperApp && nativeBackend.hasVersion(message.version))
                return true;
        }
        break;

        case "GET_ADDON_IDB_PATH": {
            let helperApp = await nativeBackend.probe();

            if (!helperApp)
                return;

            const addonId = browser.runtime.getURL("/").split("/")[2];

            return nativeBackend.fetchText(`/request/idb_path/${addonId}`)
        }

        case "RECALCULATE_ARCHIVE_SIZE":
            return recalculateArchiveSize();

        case "REINDEX_ARCHIVE_CONTENT":
            return reindexArchiveContent();

        case "RESET_CLOUD":
            return resetCloud();
    }
});


/* External message listener */
browser.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {

    sender.ishell = ishellBackend.isIShell(sender.id);

    switch (message.type) {
        case "SCRAPYARD_GET_VERSION":
            if (!isAutomationAllowed(sender))
                throw new Error();

            window.postMessage({type: "SCRAPYARD_ID_REQUESTED", sender}, "*");
            return browser.runtime.getManifest().version;

        case "SCRAPYARD_LIST_SHELVES":
            if (!sender.ishell)
                throw new Error();

            let shelves = await backend.listShelves();
            return shelves.map(n => ({name: n.name}));

        case "SCRAPYARD_LIST_GROUPS": {
            if (!sender.ishell)
                throw new Error();

            let shelves = await backend.listShelves();
            shelves = shelves.map(n => ({name: n.name}));

            let groups = await backend.listGroups();
            groups.forEach(n => renderPath(n, groups));
            groups = groups.map(n => ({name: n.name, path: n.path}));

            return [...shelves, ...groups];
        }

        case "SCRAPYARD_LIST_TAGS":
            if (!sender.ishell)
                throw new Error();

            let tags = await backend.queryTags();
            return tags.map(t => ({name: t.name.toLocaleLowerCase()}));

        case "SCRAPYARD_LIST_NODES":
            if (!sender.ishell)
                throw new Error();

            delete message.type;

            let no_shelves = message.types && !message.types.some(t => t === NODE_TYPE_SHELF);

            if (message.types)
                message.types = message.types.concat([NODE_TYPE_SHELF]);

            message.path = backend.expandPath(message.path);

            let nodes = await backend.listNodes(message);

            for (let node of nodes) {
                if (node.type === NODE_TYPE_GROUP) {
                    renderPath(node, nodes);
                }

                if (node.stored_icon)
                    node.icon = await backend.fetchIcon(node.id);
            }
            if (no_shelves)
                return nodes.filter(n => n.type !== NODE_TYPE_SHELF);
            else
                return nodes;

        case "SCRAPYARD_ADD_BOOKMARK":
            return createBookmarkExternal(message, sender);

        case "SCRAPYARD_ADD_ARCHIVE":
            return createArchiveExternal(message, sender);

        case "SCRAPYARD_GET_UUID":
            return getNodeExternal(message, sender);

        case "SCRAPYARD_UPDATE_UUID":
            return updateNodeExternal(message, sender);

        case "SCRAPYARD_REMOVE_UUID":
            return removeNodeExternal(message, sender);

        case "SCRAPYARD_PACK_PAGE":
            return packPageExternal(message, sender);

        case "SCRAPYARD_BROWSE_UUID":
            return browseNodeExternal(message, sender)

        case "SCRAPYARD_BROWSE_NODE":
            if (!sender.ishell)
                throw new Error();

            if (message.node.uuid)
                backend.getNode(message.node.uuid, true).then(node => browseNode(node));
            else
                browseNode(message.node);

            break;
    }
});

function startCloudBackgroundSync(s) {
    if (s.cloud_background_sync())
        window._backgroundSyncInterval = setInterval(
            () => cloudBackend.reconcileCloudBookmarksDB(),
            15 * 60 * 1000);
    else
        if (window._backgroundSyncInterval)
            clearInterval(window._backgroundSyncInterval);
}

settings.load(async settings => {
    navigator.storage.persist().then(async function(persistent) {
        if (persistent) {
            await browserBackend.reconcileBrowserBookmarksDB();
            startCloudBackgroundSync(settings);
        } else
            console.log("Scrapyard was denied persistent storage permissions");
    });
});

search.initializeOmnibox();


console.log("==> core.js loaded");
