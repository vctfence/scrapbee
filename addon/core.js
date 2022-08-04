import {receive, receiveExternal, send, sendLocal} from "./proxy.js";
import {systemInitialization} from "./bookmarks_init.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud_shelf.js";
import {getActiveTabMetadata} from "./bookmarking.js";
import {toggleSidebarWindow} from "./utils_chrome.js";
import {askCSRPermission, grantPersistenceQuota, startupLatch} from "./utils_browser.js";
import {DEFAULT_SHELF_ID} from "./storage.js";
import {undoManager} from "./bookmarks_undo.js";
import {settings} from "./settings.js";
import * as search from "./search.js";
import "./core_bookmarking.js";
import "./core_share.js";
import "./core_backup.js"
import "./core_backends.js";
import "./core_maintenance.js";
import "./core_ishell.js";
import "./core_automation.js";
import "./core_sync.js";

if (_BACKGROUND_PAGE)
    import("./core_import.js");

if (_BACKGROUND_PAGE && _MANIFEST_V3)
    import("./mv3_persistent.js");

receiveExternal.startListener(true);
receive.startListener(true);

(async () => {
    if (await grantPersistenceQuota()) {
        await systemInitialization;

        //showAnnouncement();

        await startupLatch(performStartupInitialization);
    }
})();

function showAnnouncement() {
    if (settings.isAddonUpdated())
        settings.pending_announcement("options.html#about");
}

async function performStartupInitialization() {
    search.initializeOmnibox();

    await browserBackend.reconcileBrowserBookmarksDB();
    await cloudBackend.enableBackgroundSync(settings.cloud_background_sync());

    if (settings.background_sync())
        await sendLocal.enableBackgroundSync({enable: true});

    if (settings.sync_on_startup())
        sendLocal.performSync();

    await undoManager.commit();

    console.log("==> core.js initialized");
}

if (browser.webRequest) {
    // remove the Origin header from add-on fetch requests
    function originWithId(header) {
        return header.name.toLowerCase() === 'origin' && header.value.startsWith('moz-extension://');
    }

    browser.webRequest.onBeforeSendHeaders.addListener(
        (details) => {
            return {
                requestHeaders: details.requestHeaders.filter(x => !originWithId(x))
            }
        },
        {urls: ["<all_urls>"]},
        ["blocking", "requestHeaders"]
    );
}

browser.commands.onCommand.addListener(function(command) {
    if (!_BACKGROUND_PAGE && command === "toggle_sidebar_window")
        toggleSidebarWindow();
    else
        addBookmarkOnCommand(command);
});

function addBookmarkOnCommand(command) {
    let action = "createBookmark";
    if (command === "archive_to_default_shelf")
        action = "createArchive";

    if (_BACKGROUND_PAGE)
        if (localStorage.getItem("option-open-sidebar-from-shortcut") === "open") {
            localStorage.setItem("sidebar-select-shelf", DEFAULT_SHELF_ID);
                browser.sidebarAction.open();
        }

    if (action === "createArchive")
        askCSRPermission()
            .then(response => {
                if (response)
                    addBookmark(action);
            })
            .catch(e => console.error(e));
    else
        addBookmark(action);
}

async function addBookmark(event) {
    const payload = await getActiveTabMetadata();
    payload.parent_id = DEFAULT_SHELF_ID;

    return sendLocal[event]({node: payload});
}

console.log("==> core.js loaded");
