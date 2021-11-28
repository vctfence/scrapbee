import {systemInitialization} from "./bookmarks_init.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud.js";
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

receiveExternal.startListener(true);
receive.startListener(true);

(async () => {
    await systemInitialization;

    if (await navigator.storage.persist()) {
        search.initializeOmnibox();
        await browserBackend.reconcileBrowserBookmarksDB();
        await cloudBackend.enableBackgroundSync(settings.cloud_background_sync());

        if (settings.background_sync())
            await sendLocal.enableBackgroundSync({enable: true});

        if (settings.sync_on_startup())
            sendLocal.performSync();

        console.log("==> core.js loaded");
    }
})();
