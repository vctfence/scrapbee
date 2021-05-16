import {backend} from "./backend.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud.js";
import {nativeBackend} from "./backend_native.js";
import {ishellBackend} from "./backend_ishell.js";
import {settings} from "./settings.js";
import * as search from "./search.js";
import {
    browseNode,
    browseNotes,
    createArchive,
    createBookmark,
    getBookmarkInfo,
    shareBookmarkToCloud,
    storePageHtml, uploadFiles
} from "./core_bookmarking.js";
import {
    browseNodeExternal,
    createArchiveExternal,
    createBookmarkExternal,
    getNodeExternal,
    packPageExternal,
    removeNodeExternal,
    scrapyardGetVersion,
    updateNodeExternal
} from "./core_automation.js";
import {exportFile, importFile} from "./core_import.js";
import {backupShelf, deleteBackup, listBackups, restoreShelf} from "./core_backup.js";
import {
    getAddonIDBPath,
    optimizeDatabase,
    reindexArchiveContent,
    resetCloud
} from "./core_repair.js";
import {
    scrapyardBrowseNode,
    scrapyardListGroups,
    scrapyardListNodes,
    scrapyardListShelves,
    scrapyardListTags
} from "./core_ishell.js";


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

        case "STORE_NOTES":
            backend.storeNotes(message.options);
            break;

        case "UPLOAD_FILES":
            return uploadFiles(message);

        case "GET_BOOKMARK_INFO":
            return getBookmarkInfo(message);

        case "GET_HIDE_TOOLBAR_SETTING":
            return settings.do_not_show_archive_toolbar();

        case "COPY_NODES":
            return backend.copyNodes(message.node_ids, message.dest_id);

        case "SHARE_TO_CLOUD":
            return shareBookmarkToCloud(message);

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
            browseNotes(message);
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
            await settings.load()
            browserBackend.reconcileBrowserBookmarksDB();
            break;

        case "RECONCILE_CLOUD_BOOKMARK_DB":
            await settings.load();
            cloudBackend.reconcileCloudBookmarksDB(message.verbose);
            break;

        case "ENABLE_CLOUD_BACKGROUND_SYNC":
            await settings.load()
            cloudBackend.startBackgroundSync(settings.cloud_background_sync());
            break;

        case "HELPER_APP_HAS_VERSION":
            return nativeBackend.hasVersion(message.version);

        case "GET_ADDON_IDB_PATH":
            return getAddonIDBPath();

        case "OPTIMIZE_DATABASE":
            return optimizeDatabase();

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
            return scrapyardGetVersion(sender);

        case "SCRAPYARD_LIST_SHELVES":
            return scrapyardListShelves(sender);

        case "SCRAPYARD_LIST_GROUPS":
            return scrapyardListGroups(sender);

        case "SCRAPYARD_LIST_TAGS":
            return scrapyardListTags(sender);

        case "SCRAPYARD_LIST_NODES":
            return scrapyardListNodes(message, sender);

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
            scrapyardBrowseNode(message, sender)
            break;
    }
});

settings.load(async settings => {
    navigator.storage.persist().then(async function(persistent) {
        if (persistent) {
            search.initializeOmnibox();
            cloudBackend.startBackgroundSync(settings.cloud_background_sync());
            await browserBackend.reconcileBrowserBookmarksDB();
        } else
            console.log("Scrapyard was denied persistent storage permissions");
    });
});


console.log("==> core.js loaded");
