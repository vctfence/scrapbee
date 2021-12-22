import {send} from "../proxy.js";
import {cloudBackend} from "../backend_cloud_shelf.js"
import {dropboxBackend} from "../backend_dropbox.js"
import {oneDriveBackend} from "../backend_onedrive.js";
import {settings} from "../settings.js"
import {fetchText, fetchWithTimeout} from "../utils_io.js";
import {selectricRefresh, simpleSelectric} from "./shelf_list.js";
import {injectCSS} from "../utils_html.js";
import {systemInitialization} from "../bookmarks_init.js";
import {showNotification} from "../utils_browser.js";
import {confirm, showDlg} from "./dialog.js";

window.onload = async function() {
    await systemInitialization;

    window.onhashchange = switchPane;
    switchPane();

    initHelpMarks();
    configureScrapyardSettingsPage();
    configureSavePageSettingsPage();
    await configureCloudSettingsPage();
    await configureSyncSettingsPage();

    loadSavePageSettings();
    loadScrapyardSettings();

    // show settings
    $("#settings-container").css("display", "flex");
};

async function switchPane() {
    $(".settings-content").hide();
    $("a.settings-menu-item").removeClass("focus")

    let hash = location.hash?.substr(1);
    if(hash) {
        ({"backup": configureBackupPage,
          "links": configureLinkCheckerPage,
          "importrdf": configureRDFImportPage,
          "helperapp": loadHelperAppLinks,
          "diagnostics": configureDiagnosticsPage,
          "help": configureHelpPage,
          "about": configureAboutPage
        })[hash]?.();

        $("#div-" + hash).show();
        $("a.settings-menu-item[href='#" + hash + "']").addClass("focus");
    } else{
        $("#div-settings").show();
        $("a.settings-menu-item[href='#settings']").addClass("focus")
    }
}

function initHelpMarks(container = "") {
    $(`${container} .help-mark`).hover(function(e){
        $(this).next(".tips.hide").show().css({left: (e.pageX )+"px", top: (e.pageY) +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });
}

async function loadSavePageSettings() {
    let object = await browser.storage.local.get("savepage-settings");
    object = object["savepage-settings"];

    function loadCheck(id) {
        $(`#${id}`).prop("checked", object[id]);
    }

    function loadValue(id) {
        $(`#${id}`).val(object[id]);
    }

    /* General options */
    loadCheck("options-retaincrossframes");
    loadCheck("options-removeunsavedurls");
    loadCheck("options-loadshadow");

    /* Saved Items options */
    loadCheck("options-savehtmlaudiovideo");
    loadCheck("options-savehtmlobjectembed");
    loadCheck("options-savehtmlimagesall");
    loadCheck("options-savecssimagesall");
    loadCheck("options-savecssfontswoff");
    loadCheck("options-savecssfontsall");
    loadCheck("options-savescripts");

    $("#options-savecssfontswoff").prop("disabled", $("#options-savecssfontsall").is(":checked"));
    $("#options-savecssfontsall").on("click", e => {
        $("#options-savecssfontswoff").prop("disabled", $("#options-savecssfontsall").is(":checked"));
    });

    /* Advanced options */
    loadValue("options-maxframedepth");
    loadValue("options-maxresourcesize");
    loadValue("options-maxresourcetime");
    loadCheck("options-allowpassive");

    $(`#options-refererheader input[name="header"]`, "").val([object["options-refererheader"]]);

    if (object["options-lazyloadtype"] == "1")
        loadCheck("options-lazyloadtype-1", true);
    else if (object["options-lazyloadtype"] == "2")
        loadCheck("options-lazyloadtype-2", true);

    loadCheck("options-removeelements");
}

async function storeSavePageSettings(e) {

    if (e.target.id === "options-lazyloadtype-1")
        $("#options-lazyloadtype-2").prop("checked", false);
    else if (e.target.id === "options-lazyloadtype-2")
        $("#options-lazyloadtype-1").prop("checked", false);

    let lazyLoadType = "0";
    if ($("#options-lazyloadtype-1").is(":checked"))
        lazyLoadType = "1";
    else if ($("#options-lazyloadtype-2").is(":checked"))
        lazyLoadType = "2";

    let newSettings = {
        /* General options */

        "options-retaincrossframes": $("#options-retaincrossframes").is(":checked"),
        "options-removeunsavedurls": $("#options-removeunsavedurls").is(":checked"),
        "options-loadshadow": $("#options-loadshadow").is(":checked"),

        /* Saved Items options */

        "options-savehtmlaudiovideo": $("#options-savehtmlaudiovideo").is(":checked"),
        "options-savehtmlobjectembed": $("#options-savehtmlobjectembed").is(":checked"),
        "options-savehtmlimagesall": $("#options-savehtmlimagesall").is(":checked"),
        "options-savecssimagesall": $("#options-savecssimagesall").is(":checked"),
        "options-savecssfontswoff": $("#options-savecssfontswoff").is(":checked"),
        "options-savecssfontsall": $("#options-savecssfontsall").is(":checked"),
        "options-savescripts": $("#options-savescripts").is(":checked"),

        /* Advanced options */

        "options-maxframedepth": +$("#options-maxframedepth").val(),
        "options-maxresourcesize": +$("#options-maxresourcesize").val(),
        "options-maxresourcetime": +$("#options-maxresourcetime").val(),
        "options-allowpassive": $("#options-allowpassive").is(":checked"),
        "options-refererheader": +$(`#options-refererheader input[name="header"]:checked`).val(),
        "options-removeelements": $("#options-removeelements").is(":checked"),
        "options-lazyloadtype": lazyLoadType
    };

    let settings = await browser.storage.local.get("savepage-settings");
    settings = settings["savepage-settings"] || {};

    Object.assign(settings, newSettings);

    await browser.storage.local.set({"savepage-settings": settings});

    send.savepageSettingsChanged();
}

function loadScrapyardSettings() {
    $("#option-sidebar-theme").val(localStorage.getItem("scrapyard-sidebar-theme") || "light");
    $("#option-shelf-list-max-height").val(settings.shelf_list_height());
    $("#option-show-firefox-bookmarks").prop("checked", settings.show_firefox_bookmarks());
    $("#option-show-firefox-bookmarks-toolbar").prop("checked", settings.show_firefox_toolbar());
    $("#option-show-firefox-bookmarks-mobile").prop("checked", settings.show_firefox_mobile());
    $("#option-switch-to-bookmark").prop("checked", settings.switch_to_new_bookmark());
    $("#option-do-not-show-archive-toolbar").prop("checked", settings.do_not_show_archive_toolbar());
    $("#option-do-not-switch-to-ff-bookmark").prop("checked", settings.do_not_switch_to_ff_bookmark());
    $("#option-display-random-bookmark").prop("checked", settings.display_random_bookmark());
    $("#option-open-bookmark-in-active-tab").prop("checked", settings.open_bookmark_in_active_tab());
    $("#option-capitalize-builtin-shelf-names").prop("checked", settings.capitalize_builtin_shelf_names());
    $("#option-export-format").val(settings.export_format());
    $("#option-use-helper-app-for-export").prop("checked", settings.use_helper_app_for_export());
    $("#option-undo-failed-imports").prop("checked", settings.undo_failed_imports());
    $("#option-browse-with-helper").prop("checked", settings.browse_with_helper());
    $("#option-helper-port").val(settings.helper_port_number());

    selectricRefresh($("#option-sidebar-theme"));
    selectricRefresh($("#option-export-format"));
}

async function setSaveCheckHandler(id, setting, callback) {
    await settings.load();
    $(`#${id}`).on("click", async e => {
        await settings[setting](e.target.checked);
        if (callback)
            return callback(e);
    });
}

async function setSaveSelectHandler(id, setting) {
    await settings.load();
    $(`#${id}`).on("change", e => settings[setting](e.target.value));
}

function configureScrapyardSettingsPage() {
    simpleSelectric("#option-sidebar-theme");
    simpleSelectric("#option-export-format");

    $("#option-sidebar-theme").on("change", e => {
        localStorage.setItem("scrapyard-sidebar-theme", e.target.value);
        send.sidebarThemeChanged({theme: e.target.value});
    });

    let inputTimeout;
    $("#option-shelf-list-max-height").on("input", e => {
        clearTimeout(inputTimeout);
        inputTimeout = setTimeout(async () => {
            await settings.load();
            await settings.shelf_list_height(+e.target.value);
            send.reloadSidebar({height: +e.target.value});
        }, 1000)
    });

    $("#option-helper-port").on("input", async e => {
        await settings.load();
        settings.helper_port_number(+e.target.value)
    });

    setSaveSelectHandler("option-export-format", "export_format");

    setSaveCheckHandler("option-capitalize-builtin-shelf-names", "capitalize_builtin_shelf_names",
        () => send.shelvesChanged());
    setSaveCheckHandler("option-show-firefox-bookmarks", "show_firefox_bookmarks",
        () => send.reconcileBrowserBookmarkDb());
    setSaveCheckHandler("option-show-firefox-bookmarks-toolbar", "show_firefox_toolbar",
        () => send.externalNodesReady());
    setSaveCheckHandler("option-display-random-bookmark", "display_random_bookmark",
        e => send.displayRandomBookmark({display: e.target.checked}));
    setSaveCheckHandler("option-show-firefox-bookmarks-mobile", "show_firefox_mobile");
    setSaveCheckHandler("option-do-not-show-archive-toolbar", "do_not_show_archive_toolbar");
    setSaveCheckHandler("option-switch-to-bookmark", "switch_to_new_bookmark");
    setSaveCheckHandler("option-open-bookmark-in-active-tab", "open_bookmark_in_active_tab");
    setSaveCheckHandler("option-do-not-switch-to-ff-bookmark", "do_not_switch_to_ff_bookmark");
    setSaveCheckHandler("option-use-helper-app-for-export", "use_helper_app_for_export");
    setSaveCheckHandler("option-undo-failed-imports", "undo_failed_imports");
    setSaveCheckHandler("option-browse-with-helper", "browse_with_helper");
}

function configureSavePageSettingsPage() {
    $(`#div-capturesettings input[type="checkbox"]`).on("click", storeSavePageSettings);
    $(`#div-capturesettings input[type="radio"]`).on("click", storeSavePageSettings);
    $(`#div-capturesettings input[type="number"]`).on("input", storeSavePageSettings);
}

async function configureCloudSettingsPage() {
    const dropboxRadio = $("#provider-dropbox");
    const oneDriveRadio = $("#provider-onedrive");

    let activeProvider;
    if (settings.active_cloud_provider() === oneDriveBackend.ID)
        activeProvider = oneDriveBackend;
    else
        activeProvider = dropboxBackend;

    $("input[name=cloud-providers][value=" + activeProvider.ID + "]").prop('checked', true);

    async function setActiveProvider(provider) {
        activeProvider = provider;
        await settings.active_cloud_provider(activeProvider.ID);
        await send.cloudProviderChanged({provider: activeProvider.ID});
        if (activeProvider.isAuthenticated())
            send.shelvesChanged({synchronize: true})
    }

    dropboxRadio.on("change", e => setActiveProvider(dropboxBackend));
    oneDriveRadio.on("change", e => setActiveProvider(oneDriveBackend));

    const enableCloudCheck = $("#option-enable-cloud");
    enableCloudCheck.prop("checked", settings.cloud_enabled());
    enableCloudCheck.on("change", async e => {
        await settings.load();
        await settings.cloud_enabled(e.target.checked);

        if (e.target.checked) {
            const success = await activeProvider.authenticate();
            if (success)
                $(`#auth-${activeProvider.ID}`).val("Sign out");
        }
        send.reconcileCloudBookmarkDb()
    });

    $("#option-cloud-background-sync").prop("checked", settings.cloud_background_sync());
    await setSaveCheckHandler("option-cloud-background-sync", "cloud_background_sync", async e => {
        send.enableCloudBackgroundSync({enable: e.target.checked});
    });

    if (dropboxBackend.isAuthenticated())
        $(`#auth-dropbox`).val("Sign out");
    if (oneDriveBackend.isAuthenticated())
        $(`#auth-onedrive`).val("Sign out");

    function providerAuthHandler(provider) {
        return async () => {
            if (provider.isAuthenticated())
                await provider.signOut();
            else
                await provider.authenticate();

            $(`#auth-${provider.ID}`).val(provider.isAuthenticated()? "Sign out": "Sign in");
        };
    }

    $("#auth-dropbox").on("click", providerAuthHandler(dropboxBackend));
    $("#auth-onedrive").on("click", providerAuthHandler(oneDriveBackend));
}

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

async function configureBackupPage() {
    const backupDiv = $("#div-backup");

    let backupManager = backupDiv.data("manager");
    if (!backupManager) {
        injectCSS("options_backup.css")
        backupDiv.html(await fetchText("options_backup.html"));
        const backupModule = await import("./options_backup.js");
        backupManager = new backupModule.BackupManager();
        backupDiv.data("manager", backupManager);
        initHelpMarks("#div-backup");
    }

    backupManager.load();
}

async function configureLinkCheckerPage() {
    const linksDiv = $("#div-links");

    let linkChecker = linksDiv.data("checker");
    if (!linkChecker) {
        injectCSS("options_checklinks.css")
        linksDiv.html(await fetchText("options_checklinks.html"));
        const linksModule = await import("./options_checklinks.js");
        linkChecker = new linksModule.LinkChecker();
        linksDiv.data("checker", linkChecker);
    }

    linkChecker.load();
}

async function configureRDFImportPage() {
    const rdfImportDiv = $("#div-importrdf");

    let module = rdfImportDiv.data("module");
    if (!module) {
        injectCSS("options_rdf.css")
        rdfImportDiv.html(await fetchText("options_rdf.html"));
        module = await import("./options_rdf.js");
        rdfImportDiv.data("module", module);
        initHelpMarks("#div-importrdf");
        module.load();
    }
}

function configureDiagnosticsPage() {
    $("a.settings-menu-item[href='#diagnostics']").show();

    function isIDBWriteError(error) {
        return error.name === "OpenFailedError" && error.message
            && error.message.includes("A mutation operation was attempted on a "
                                                + "database that did not allow mutations");
    }

    function formatIDBWriteError() {
        const errorDescriptionPre = $("#diagnostics-error-info");
        const parent = errorDescriptionPre.parent();
        errorDescriptionPre.remove();
        $("#diagnostics-guide").remove();

        $("<p>Scrapyard can not open its database for writing. "
            + "This may be a consequence of particular combination of browser and system settings or an interference with "
            + "Firefox profile files, for example, by an antivirus as it is explained on the addon "
            + "<a href='https://addons.mozilla.org/en-US/firefox/addon/scrapyard/'>page</a></p>.")
            .appendTo(parent);
    }

    function formatGenericError(error) {
        $("#diagnostics-error-info").text(
            `Error name: ${error.name}\n`
            + `Error message: ${error.message}\n`
            + `Origin: ${error.origin}\n`
            + `Browser version: ${navigator.userAgent}\n\n`
            + `Stacktrace\n\n`
            + `${error.stack}`);
    }

    let error = localStorage.getItem("scrapyard-diagnostics-error");
    if (error) {
        error = JSON.parse(error);

        if (isIDBWriteError(error))
            formatIDBWriteError();
        else
            formatGenericError(error);

        localStorage.removeItem("scrapyard-diagnostics-error");
    }
    else {
        $("#diagnostics-error-info").text("No errors detected.");
    }
}

async function loadHelperAppLinks() {
    const helperAppVersionP = $("#helper-app-version");
    if (helperAppVersionP.data("loaded"))
        return;

    helperAppVersionP.data("loaded", true);

    function setDownloadLinks(link1, link2) {
        const app = link1.endsWith(".exe")? link1: link2;
        const archive = link1.endsWith(".zip")? link1: link2;
        $("#helper-windows-inst").attr("href", app);
        $("#helper-manual-inst").attr("href", archive);
    }

    try {
        const apiURL = "https://api.github.com/repos/gchristensen/scrapyard/releases/latest";
        const response = await fetchWithTimeout(apiURL, {timeout: 30000});

        if (response.ok) {
            let release = JSON.parse(await response.text());
            setDownloadLinks(release.assets[0].browser_download_url, release.assets[1].browser_download_url);

            let version = release.name.split(" ");
            version = version[version.length - 1];

            helperAppVersionP.html(`<b>Latest version:</b> ${version}`);
        }
        else
            throw new Error();
    }
    catch (e) {
        console.error(e);
        setDownloadLinks("#heperapp", "#heperapp");
        helperAppVersionP.html(`<b>Latest version:</b> error`);
    }

    const installedVersion = await send.helperAppGetVersion();
    const INSTALLED_VERSION_TEXT = `<b>Installed version:</b> %%%`;

    if (installedVersion)
        $("#helper-app-version-installed").html(INSTALLED_VERSION_TEXT
            .replace("%%%", "v" + installedVersion));
    else
        $("#helper-app-version-installed").html(INSTALLED_VERSION_TEXT
            .replace("%%%", "not installed"));
}

async function configureHelpPage() {
    if ($("#div-help").is(":empty")) {
        let help = await fetchText("locales/en/help.html");
        help = help.replaceAll(`src="images/`, `src="locales/en/images/`);
        $("#div-help").html(help);
    }
}

async function configureAboutPage() {
    if ($("#about-changes").is(":empty")) {
        $("#about-changes").html(await fetchText("options_changes.html"));
        $("#about-version").text(`Version: ${browser.runtime.getManifest().version}`);
    }
}

