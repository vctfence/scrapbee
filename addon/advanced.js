import {send} from "./proxy.js";
import {settings} from "./settings.js";
import {showNotification} from "./utils.js";

function initHelpMarks() {
    $(".help-mark").hover(function(e){
        $(this).next(".tips.hide").show().css({left: (e.pageX )+"px", top: (e.pageY) +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });
}

function configureAutomationPanel() {
    $("#option-enable-automation").prop("checked", settings.enable_automation());
    $("#option-extension-whitelist").val(settings.extension_whitelist()?.join(", "));

    $("#option-enable-automation").on("change", async e => {
        await settings.load();
        settings.enable_automation(e.target.checked);
    });

    $("#option-extension-whitelist").on("input", async e => {
        await settings.load();

        if (e.target.value) {
            let ids = e.target.value.split(",").map(s => s.trim()).filter(s => !!s);
            if (ids.length)
                settings.extension_whitelist(ids);
            else
                settings.extension_whitelist(null);
        }
        else
            settings.extension_whitelist(null);
    });
}

async function configureDBPath() {
    const idbPath = await send.getAddonIdbPath();
    if (idbPath)
        $("#addon-db-path-input").val(idbPath);

    $("#db-path-copy-button").on("click", e => {
        navigator.clipboard.writeText($("#addon-db-path-input").val());
    });
}

function configureBackupCompressionPanel() {
    $("#option-compression-method").val(settings.backup_compression_method() || "DEFLATE");
    $("#option-compression-level").val(settings.backup_compression_level() || "5");

    $("#option-compression-method option[value='EMPTY']").remove();
    $("#option-compression-level option[value='EMPTY']").remove();

    $("#option-compression-method").on("change", async e => {
        await settings.load();
        settings.backup_compression_method(e.target.value)
    });
    $("#option-compression-level").on("change", async  e => {
        await settings.load();
        settings.backup_compression_level(parseInt(e.target.value))
    });
}

function configureRepairPanel() {
    $("#option-repair-images").on("change", async e => {
        await settings.load();
        settings.repair_icons(e.target.checked);
    });

    $("#calculate-size-link").on("click", e => {
        e.preventDefault();
        send.recalculateArchiveSize();
        $("#calculate-size-link").off("click");
    });

    $("#reindex-content-link").on("click", e => {
        e.preventDefault();
        send.reindexArchiveContent();
        $("#reindex-content-link").off("click");
    });

    $("#reset-cloud-link").on("click", async e => {
        e.preventDefault();

        if (confirm("This will remove all cloud content. Are you sure?")) {
            let success = await send.resetCloud();

            if (!success)
                showNotification("Error accessing cloud.")
        }
    });
}

function configureImpExpPanel() {
    $("#export-settings-link").click(async e => {
        e.preventDefault();

        let exported = {};
        exported.addon = "Scrapyard";
        exported.version = browser.runtime.getManifest().version;

        let settings = await browser.storage.local.get();

        delete settings["scrapyard-settings"]["ishell_presents"];
        delete settings["scrapyard-settings"]["dropbox_refresh_token"];
        delete settings["scrapyard-settings"]["pending_announcement"];

        settings["scrapyard-settings"]["last_shelf"] = 1;

        settings["localstorage-settings"] = {
            "editor-font-size": localStorage.getItem("editor-font-size"),
            "notes-font-size": localStorage.getItem("notes-font-size"),
            "scrapyard-sidebar-theme": localStorage.getItem("scrapyard-sidebar-theme")
        };

        Object.assign(exported, settings);

        // download link
        let file = new Blob([JSON.stringify(exported, null, 2)], {type: "application/json"});
        let url = URL.createObjectURL(file);
        let filename = "scrapyard-settings.json"

        let download = await browser.downloads.download({url: url, filename: filename, saveAs: true});

        let download_listener = delta => {
            if (delta.id === download && delta.state && delta.state.current === "complete") {
                browser.downloads.onChanged.removeListener(download_listener);
                URL.revokeObjectURL(url);
            }
        };
        browser.downloads.onChanged.addListener(download_listener);
    });

    $("#import-settings-link").click((e) => {
        e.preventDefault();
        $("#import-settings-file-picker").click();
    });

    $("#import-settings-file-picker").change(async e => {
        if (e.target.files.length > 0) {
            let reader = new FileReader();
            reader.onload = async function(re) {
                let imported = JSON.parse(re.target.result);

                if (imported.addon !== "Scrapyard") {
                    showNotification("Export format is not supported.");
                    return;
                }

                // versioned operations here

                delete imported.addon;
                delete imported.version;

                const localStorageSettings = imported["localstorage-settings"];

                if (localStorageSettings["editor-font-size"])
                    localStorage.setItem("editor-font-size", localStorageSettings["editor-font-size"]);

                if (localStorageSettings["notes-font-size"])
                    localStorage.setItem("notes-font-size", localStorageSettings["notes-font-size"]);

                if (localStorageSettings["scrapyard-sidebar-theme"])
                    localStorage.setItem("scrapyard-sidebar-theme", localStorageSettings["scrapyard-sidebar-theme"]);

                delete imported["localstorage-settings"];

                let settings = await browser.storage.local.get();
                Object.assign(settings["savepage-settings"], imported["savepage-settings"]);
                Object.assign(settings["scrapyard-settings"], imported["scrapyard-settings"]);

                await browser.storage.local.set(settings);

                chrome.runtime.reload();
            };
            reader.readAsText(e.target.files[0]);
        }
    });

}

window.onload = async function() {
    await settings.load();

    initHelpMarks();
    configureAutomationPanel();
    configureDBPath();
    configureBackupCompressionPanel();
    configureRepairPanel();
    configureImpExpPanel();

}
