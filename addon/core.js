import {systemInitialization} from "./bookmarks_init.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud_shelf.js";
import {receive, receiveExternal, send, sendLocal} from "./proxy.js";
import {settings} from "./settings.js";
import * as search from "./search.js";
import * as bookmarking from "./core_bookmarking.js";
import * as imports from "./core_import.js";
import * as share from "./core_share.js";
import * as backup from "./core_backup.js"
import * as backends from "./core_backends.js";
import * as repair from "./core_maintenance.js";
import * as ishell from "./core_ishell.js";
import * as automation from "./core_automation.js";
import * as sync from "./core_sync.js";
import {getActiveTabMetadata} from "./bookmarking.js";
import {DEFAULT_SHELF_ID} from "./storage.js";
import {UndoManager} from "./bookmarks_undo.js";

browser.runtime.onInstalled.addListener(async details => {
    await settings.load();

    if (details.reason === "install") {
        settings.install_date(Date.now());
        settings.install_version(browser.runtime.getManifest().version);
    }
    else if (details.reason === "update") {
        //settings.pending_announcement("options.html#about");
    }
});

receiveExternal.startListener(true);
receive.startListener(true);

(async () => {
    await systemInitialization;

    if (await navigator.storage.persist()) {
        // TODO: in MV3 somehow this should be done only once on the addon load
        await performStartupInitialization();

        console.log("==> core.js loaded");
    }
})();

async function performStartupInitialization() {
    search.initializeOmnibox();

    await browserBackend.reconcileBrowserBookmarksDB();
    await cloudBackend.enableBackgroundSync(settings.cloud_background_sync());

    if (settings.background_sync())
        await sendLocal.enableBackgroundSync({enable: true});

    if (settings.sync_on_startup())
        sendLocal.performSync();

    await UndoManager.commit();
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

// remove the Origin header from add-on fetch requests
function originWithId(header) {
    return header.name.toLowerCase() === 'origin' && header.value.startsWith('moz-extension://');
}

browser.commands.onCommand.addListener(function(command) {
    let action = "createBookmark";
    if (command === "archive_to_default_shelf")
        action = "createArchive";

    if (localStorage.getItem("option-open-sidebar-from-shortcut") === "open") {
        localStorage.setItem("sidebar-select-shelf", DEFAULT_SHELF_ID);
        browser.sidebarAction.open();
    }

    addBookmark(action);
});

async function addBookmark(event) {
    const payload = await getActiveTabMetadata();
    payload.parent_id = DEFAULT_SHELF_ID;

    return sendLocal[event]({data: payload});
}
