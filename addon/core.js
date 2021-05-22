import {backend} from "./backend.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud.js";
import {settings} from "./settings.js";
import * as search from "./search.js";
import {receive, receiveExternal} from "./proxy.js";
import * as bookmarking from "./core_bookmarking.js";
import * as imports from "./core_import.js";
import * as share from "./core_share.js";
import * as backup from "./core_backup.js"
import * as backends from "./core_backends.js";
import * as repair from "./core_maintenance.js";
import * as ishell from "./core_ishell.js";
import * as automation from "./core_automation.js";

settings.load(async settings => {
    navigator.storage.persist().then(async function(persistent) {
        if (persistent) {
            receive.startListener(true);
            receiveExternal.startListener(true);

            search.initializeOmnibox();

            cloudBackend.startBackgroundSync(settings.cloud_background_sync());
            await browserBackend.reconcileBrowserBookmarksDB();
        }
        else
            console.log("Scrapyard was denied persistent storage permissions");
    });
});

console.log("==> core.js loaded");
