import {backend} from "./backend.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud.js";
import {receive, receiveExternal} from "./proxy.js";
import * as search from "./search.js";
import * as bookmarking from "./core_bookmarking.js";
import * as imports from "./core_import.js";
import * as share from "./core_share.js";
import * as backup from "./core_backup.js"
import * as backends from "./core_backends.js";
import * as repair from "./core_maintenance.js";
import * as ishell from "./core_ishell.js";
import * as automation from "./core_automation.js";

receive.startListener(true);
receiveExternal.startListener(true);

(async () => {
    await backend;

    if (await navigator.storage.persist()) {
        search.initializeOmnibox();
        cloudBackend.startBackgroundSync();
        await browserBackend.reconcileBrowserBookmarksDB();

        console.log("==> core.js loaded");
    }
})();
