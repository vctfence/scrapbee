import {settings} from "../../settings.js";
import {send} from "../../proxy.js";
import {showNotification} from "../../utils_browser.js";
import {showDlg} from "../dialog.js";
import {setSaveCheckHandler} from "../options.js";

async function configureSyncSettingsPage() {
    const enableSyncCheck = $("#option-enable-sync");
    const syncDirectoryPathText = $("#sync-directory-path");

    function disableSync(message) {
        enableSyncCheck.prop("checked", false);
        settings.sync_enabled(false);
        settings.last_sync_date(null);
        send.syncStateChanged({enabled: false});

        if (typeof message === "string")
            showNotification(message);
    }

    function updateSyncTime() {
        if (settings.last_sync_date()) {
            let strDate = new Date(settings.last_sync_date()) + "";
            strDate = strDate.split("GMT")[0];

            $("#sync-last-date").html(`<b>Last synchronization:</b> ${strDate}`);
        }
    }

    if (settings.sync_directory())
        syncDirectoryPathText.val(settings.sync_directory())

    enableSyncCheck.prop("checked", settings.sync_enabled());
    await setSaveCheckHandler("option-enable-sync", "sync_enabled", async e => {
        if (!e.target.checked) {
            disableSync();
            return;
        }

        const sync_directory = syncDirectoryPathText.val();

        if (!sync_directory) {
            disableSync("Please choose a synchronization folder.");
            return;
        }

        const status = await send.checkSyncDirectory({sync_directory});
        if (status) {
            settings.sync_directory(sync_directory);

            let width;
            let warning = " This may take some time.";

            if (status === "populated") {
                warning = " It will merge all existing content and may resurrect items that were deleted when "
                    + " the synchronization was disabled. Make sure that you have a fresh backup."
                width = "50%";
            }

            const message = `Scrapyard will perform the initial synchronization.${warning} Continue?`;

            if (await showDlg("confirm", {title: "Sync", message, width, wrap: true})) {
                send.syncStateChanged({enabled: e.target.checked});
                send.performSync({isInitial: true});
            }
            else
                disableSync();
        }
        else
            disableSync();
    });

    $("#option-background-sync").prop("checked", settings.background_sync());
    await setSaveCheckHandler("option-background-sync", "background_sync", async e => {
        send.enableBackgroundSync({enable: e.target.checked});
    });

    $("#option-sync-on-startup").prop("checked", settings.sync_on_startup());
    await setSaveCheckHandler("option-sync-on-startup", "sync_on_startup");

    $("#option-sync-on-close-sidebar").prop("checked", settings.sync_on_close_sidebar());
    await setSaveCheckHandler("option-sync-on-close-sidebar", "sync_on_close_sidebar");

    syncDirectoryPathText.on("input", disableSync);

    updateSyncTime();
}

export function load() {
    configureSyncSettingsPage();
}
