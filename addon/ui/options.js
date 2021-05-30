import {send} from "../proxy.js";
import {backend} from "../backend.js"
import {cloudBackend} from "../backend_cloud.js"
import {dropboxBackend} from "../backend_dropbox.js"
import {settings} from "../settings.js"
import {confirm} from "./dialog.js";
import {formatBytes, toHHMMSS} from "../utils.js";
import {
    isSpecialShelf,
    CLOUD_SHELF_NAME,
    DONE_SHELF_NAME,
    EVERYTHING,
    FIREFOX_SHELF_NAME,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    TODO_SHELF_NAME
} from "../storage.js";
import {getFavicon} from "../favicon.js";
import {showNotification} from "../utils_browser.js";
import {fetchText, fetchWithTimeout} from "../utils_io.js";
import {selectricRefresh, ShelfList, simpleSelectric} from "./shelf_list.js";

window.onload = async function() {
    await backend;

    initHelpMarks();

    window.onhashchange = switchPane;
    switchPane();

    configureScrapyardSettingsPage();
    configureSavePageSettingsPage();
    configureCloudSettingsPage();

    $("#div-page").css("display", "table-row");

    loadSavePageSettings();
    loadScrapyardSettings();

    // Import RDF //////////////////////////////////////////////////////////////////////////////////////////////////////

    $("#invalid-imports-container").on("click", ".invalid-import", selectNode);
    $("#start-rdf-import").on("click", onStartRDFImport);

    // Link Checker/////////////////////////////////////////////////////////////////////////////////////////////////////

    initializeLinkChecker();
    doAutoStartCheckLinks();

    // Backup //////////////////////////////////////////////////////////////////////////////////////////////////////////

    initializeBackup();
};

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

function configureScrapyardSettingsPage() {

    async function setSaveCheckHandler(id, setting, callback) {
        await settings.load();
        $(`#${id}`).on("click", async e => {
            await settings[setting](e.target.checked);
            if (callback)
                callback(e);
        });
    }

    async function setSaveSelectHandler(id, setting) {
        await settings.load();
        $(`#${id}`).on("change", e => settings[setting](e.target.value));
    }

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
    setSaveCheckHandler("option-helper-port", "helper_port_number");
}

function configureSavePageSettingsPage() {
    $(`#div-savesettings input[type="checkbox"]`).on("click", storeSavePageSettings);
    $(`#div-savesettings input[type="radio"]`).on("click", storeSavePageSettings);
    $(`#div-savesettings input[type="number"]`).on("input", storeSavePageSettings);
}

function configureCloudSettingsPage() {
    $("#option-enable-cloud").prop("checked", settings.cloud_enabled());

    $("#option-enable-cloud").on("change", async e => {
        await settings.load();
        await settings.cloud_enabled(e.target.checked);

        if (e.target.checked) {
            const success = await cloudBackend.authenticate();
            if (success)
                $("#auth-dropbox").val("Sign out");
        }
        send.reconcileCloudBookmarkDb()
    });

    $("#option-cloud-background-sync").prop("checked", settings.cloud_background_sync());

    $("#option-cloud-background-sync").on("change", async e => {
        await settings.load();
        await settings.cloud_background_sync(e.target.checked);
        send.enableCloudBackgroundSync();
    });

    if (dropboxBackend.isAuthenticated())
        $("#auth-dropbox").val("Sign out");

    $("#auth-dropbox").on("click", async () => {
        await dropboxBackend.authenticate(!dropboxBackend.isAuthenticated());
        $("#auth-dropbox").val(dropboxBackend.isAuthenticated()? "Sign out": "Sign in");
    });
}

let helperAppLinksLoaded = false;
async function loadHelperAppLinks() {
    if (helperAppLinksLoaded)
        return;

    function setDownloadLinks(app, archive) {
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

            $("#helper-app-version").html(`<b>Latest version:</b> ${version}`);

            helperAppLinksLoaded = true;
        }
        else
            throw new Error();
    }
    catch (e) {
        console.error(e);
        setDownloadLinks("#heperapp", "#heperapp");
        $("#helper-app-version").html(`<b>Latest version:</b> error`);
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
    if (!$("#div-help").html()) {
        let help = await fetchText("locales/en/help.html");
        help = help.replaceAll(`src="images/`, `src="locales/en/images/`);
        $("#div-help").html(help);
    }
}

async function configureAboutPage() {
    if (!$("#about-changes").html()) {
        $("#about-changes").html(await fetchText("changes.html"));
        $("#about-version").text(`Version: ${browser.runtime.getManifest().version}`);
    }
}

function configureDiagnosticsPage() {
    $("a.left-index[href='#diagnostics']").show();
    let error = localStorage.getItem("scrapyard-diagnostics-error");
    if (error) {
        error = JSON.parse(error);
        $("#diagnostics-error-info").text(
`Error name: ${error.name}
Error message: ${error.message}
Origin: ${error.origin}

Stacktrace

${error.stack}`);

        localStorage.removeItem("scrapyard-diagnostics-error");
    }
    else {
        $("#diagnostics-error-info").text("No errors detected.");
    }
}

function switchPane() {
    $(".div-area").hide();
    $("a.left-index").removeClass("focus")

    let m;
    if(m = location.href.match(/#(\w+)$/)) {

        if (m[1] === "backup")
            populateBackup();
        else if (m[1] === "helperapp")
            loadHelperAppLinks();
        else if (m[1] === "diagnostics")
            configureDiagnosticsPage();
        else if (m[1] === "help")
            configureHelpPage();
        else if (m[1] === "about")
            configureAboutPage();

        $("#div-" + m[1]).show();
        $("a.left-index[href='#" + m[1] + "']").addClass("focus")
    } else{
        $("#div-settings").show();
        $("a.left-index[href='#settings']").addClass("focus")
    }
}

function initHelpMarks() {
    $(".help-mark").hover(function(e){
        $(this).next(".tips.hide").show().css({left: (e.pageX )+"px", top: (e.pageY) +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });
}

function selectNode(e) {
    e.preventDefault();
    send.selectNode({node: {id: parseInt(e.target.getAttribute("data-id"))}});
}

// Import RDF //////////////////////////////////////////////////////////////////////////////////////////////////////

let importing = false;
async function onStartRDFImport(e) {
    let finalize = () => {
        $("#start-rdf-import").val("Import");
        $("#rdf-shelf-name").prop('disabled', false);
        $("#rdf-import-path").prop('disabled', false);
        $("#rdf-import-threads").prop('disabled', false);

        $("#rdf-progress-row").text("Ready");
        importing = false;
        browser.runtime.onMessage.removeListener(importListener);
    };

    let shelf = $("#rdf-shelf-name").val();
    let path = $("#rdf-import-path").val();

    if (importing) {
        send.cancelRdfImport();
        finalize();
        return;
    }

    if (!shelf || !path) {
        showNotification({message: "Please, specify all import parameters."});
        return;
    }

    let shelf_node = await backend.queryShelf(shelf);
    if (isSpecialShelf(shelf) || shelf_node) {
        showNotification({message: "The specified shelf already exists."});
        return;
    }

    importing = true;
    $("#start-rdf-import").val("Cancel");
    $("#rdf-shelf-name").prop('disabled', true);
    $("#rdf-import-path").prop('disabled', true);
    $("#rdf-import-threads").prop('disabled', true);

    let progress_row = $("#rdf-progress-row");

    progress_row.text("initializing bookmark directory structure...");
    //$("#rdf-import-progress").val(0);
    //$("#rdf-progress-row").show();

    let runningProgress = 0;

    let importListener = message => {
        if (message.type === "RDF_IMPORT_PROGRESS") {
            let bar = $("#rdf-import-progress");
            if (!bar.length) {
                bar = $(`<progress id="rdf-import-progress" max="100" value="0"/>`);
                progress_row.empty().append(bar);
            }
            if (message.progress > runningProgress) {
                runningProgress = message.progress;
                bar.val(message.progress);
            }
        }
        else if (message.type === "RDF_IMPORT_ERROR") {
            let invalid_link = `<a href="#" target="_blank" data-id="${message.bookmark.id}"
                                       class="invalid-import">${message.bookmark.name}</a>`;
            $("#invalid-imports-container").show();
            $("#invalid-imports").append(`<tr><td>${message.error}</td><td>${invalid_link}</td></tr>`);
        }
        else if (message.type === "OBTAINING_ICONS") {
            progress_row.text("Obtaining page icons...");
        }
    };

    browser.runtime.onMessage.addListener(importListener);

    send.importFile({file: path, file_name: shelf, file_ext: "RDF",
        threads: $("#rdf-import-threads").val(),
        quick: $("#rdf-import-quick").is(':checked')})
        .then(finalize)
        .catch(e => {
            showNotification({message: e.message});
            finalize();
        });
}


// Link Checker/////////////////////////////////////////////////////////////////////////////////////////////////////

function initializeLinkChecker() {
    $("#start-check-links").on("click", startCheckLinks);

    $("#link-check-timeout").val(settings.link_check_timeout() || DEFAULT_LINK_CHECK_TIMEOUT)
    $("#link-check-timeout").on("input", async e => {
        await settings.load();
        let timeout = parseInt(e.target.value);
        settings.link_check_timeout(isNaN(timeout)? DEFAULT_LINK_CHECK_TIMEOUT: timeout);
    });

    const shelfList = new ShelfList("#check-scope", {
        maxHeight: settings.shelf_list_height() || settings.default.shelf_list_height
    });

    shelfList.initDefault();
}

const DEFAULT_LINK_CHECK_TIMEOUT = 10;

let abortCheckLinks;
let autoStartCheckLinks;
let autoLinkCheckScope;

async function doAutoStartCheckLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    autoStartCheckLinks = !!urlParams.get("menu");

    if (autoStartCheckLinks) {
        $("#update-icons").prop("checked", urlParams.get("repairIcons") === "true");
        let scopePath = await backend.computePath(parseInt(urlParams.get("scope")));
        $(".selectric-wrapper", $("#check-links"))
            .replaceWith(`<span style="white-space: nowrap">${scopePath[scopePath.length - 1].name}&nbsp;&nbsp;</span>`);
        autoLinkCheckScope = scopePath.map(g => g.name).join("/");
        startCheckLinks();
    }
}

function stopCheckLinks() {
    $("#start-check-links").val("Check");
    $("#current-link-title").text("");
    $("#current-link-url").text("");
    $("#current-link").css("visibility", "hidden");
    abortCheckLinks = false;

    if ($("#update-icons").is(":checked")) {
        setTimeout(() => send.nodesUpdated(), 500);
    }
}

async function startCheckLinks() {
    if ($("#start-check-links").val() === "Check") {

        $("#start-check-links").val("Stop");

        let updateIcons = $("#update-icons").is(":checked");
        let path;

        if (autoStartCheckLinks)
            path = autoLinkCheckScope;
        else {
            let scope = $(`#check-scope option[value='${$("#check-scope").val()}']`).text();
            path = scope === EVERYTHING ? undefined : scope;
        }

        $("#current-link").css("visibility", "visible");
        $("#invalid-links-container").hide();
        $("#invalid-links").html("");

        async function updateIcon(node, html) {
            let favicon = await getFavicon(node.uri, html);

            if (favicon) {
                node.icon = favicon;
                await backend.storeIcon(node);
            }
            else if (node.icon && !node.stored_icon) {
                node.icon = undefined;
                await backend.updateNode(node);
            }
        }

        function displayLinkError(error, node) {
            $("#invalid-links-container").show();
            let invalidLink = `<a href="${node.uri}" target="_blank" class="invalid-link">${node.name}</a>`
            $("#invalid-links").append(`<tr>
                                            <td>
                                                <img id="link-check-select-${node.id}" class="result-action-icon"
                                                     src="../icons/tree-select.svg" title="Select"/>
                                            </td>
                                            <td>
                                                <a href="http://web.archive.org/web/${encodeURIComponent(node.uri)}"
                                                   target="_blank"><img class="result-action-icon-last"
                                                     src="../icons/web-archive.svg" title="Web Archive"/></a>
                                            </td>
                                            <td class="link-check-error">${error}</td>
                                            <td>${invalidLink}</td>
                                        </tr>`);
            $(`#link-check-select-${node.id}`).click(e => send.selectNode({node}));
        }

        const nodes = await backend.listNodes({path: path, types: [NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK]});

        for (let node of nodes) {
            if (abortCheckLinks)
                break;

            if (!node.uri)
                continue;

            $("#current-link-title").text(node.name);
            $("#current-link-url").text(node.uri);

            let error;
            let networkError;
            let contentType;
            let response;

            try {
                let timeout = parseInt($("#link-check-timeout").val());
                timeout = isNaN(timeout)? DEFAULT_LINK_CHECK_TIMEOUT: timeout;
                response = await fetchWithTimeout(node.uri, {timeout: timeout * 1000});

                if (!response.ok)
                    error = `[HTTP Error: ${response.status}]`;
                else
                    contentType = response.headers.get("content-type");
            }
            catch (e) {
                networkError = true;

                if (e.name === "AbortError")
                    error = `[Timeout]`;
                else
                    error = "[Unavailable]"
            }

            if (error) {
                displayLinkError(error, node);

                if (networkError && updateIcons && node.icon && !node.stored_icon) {
                    node.icon = undefined;
                    await backend.updateNode(node);
                }
            }
            else if (updateIcons && contentType?.toLowerCase()?.startsWith("text/html")) {
                try {
                    await updateIcon(node, await response.text());
                }
                catch (e) {
                    console.error(e)
                }
            }
        }

        stopCheckLinks();
    }
    else {
        stopCheckLinks();
        abortCheckLinks = true;
    }
}

// Backup //////////////////////////////////////////////////////////////////////////////////////////////////////////

let backupTree;
let availableBackups;
let overallBackupSize;
let backupIsInProcess;
let restoreIsInProcess;
let processingInterval;
let processingTime;

function initializeBackup() {
    $("#backup-directory-path").val(settings.backup_directory_path());

    let filterTimeout;
    $("#backup-filter").on("input", e => {
        clearTimeout(filterTimeout);
        filterTimeout = setTimeout(() => {
           filterBackups(e.target.value);
        }, 1000)
    });

    let pathTimeout;
    $("#backup-directory-path").on("input", e => {
        clearTimeout(pathTimeout);
        pathTimeout = setTimeout(() => {
            settings.backup_directory_path(e.target.value);
            backupListFiles();
        }, 1000)
    });

    $("#backup-directory-path-refresh").on("click", e => backupListFiles());

    $("#backup-button").on("click", async e => backupShelf());

    $("#compress-backup").prop("checked", settings.enable_backup_compression());
    $("#compress-backup").on("change", e => settings.enable_backup_compression(e.target.checked))

    const shelfList = new ShelfList("#backup-shelf", {
        maxHeight: settings.shelf_list_height() || settings.default.shelf_list_height
    });

    shelfList.initDefault();

    $("#backup-tree").jstree({
        plugins: ["wholerow", "contextmenu"],
        core: {
            worker: false,
            animation: 0,
            multiple: true,
            themes: {
                name: "default",
                dots: false,
                icons: true,
            },
            check_callback: true
        },
        contextmenu: {
            show_at_node: false,
            items: backupTreeContextMenu
        }
    });

    backupTree = $("#backup-tree").jstree(true);
}

function backupTreeContextMenu(jnode) {
    if (backupIsInProcess || restoreIsInProcess)
        return null;

    let notRestorable = () => {
        const selected = backupTree.get_selected(true);
        const name = jnode.data.name.toLowerCase();
        return name === FIREFOX_SHELF_NAME || name === CLOUD_SHELF_NAME
            || name === TODO_SHELF_NAME.toLowerCase() || name === DONE_SHELF_NAME.toLowerCase()
            || selected?.length > 1;
    };

    return {
        restore: {
            label: "Restore",
            _disabled: notRestorable(),
            action: () => restoreShelf(jnode)
        },
        restoreAsSeparateShelf: {
            label: "Restore as a Separate Shelf",
            _disabled: backupTree.get_selected(true).length > 1,
            action: () => restoreShelf(jnode, true)
        },
        delete: {
            separator_before: true,
            label: "Delete",
            action: () => setTimeout(() => deleteBackups())
        },
    };
}

function backupToJsTreeNode(node) {
    const jnode = {};
    let date = new Date(node.timestamp);
    date = date.toISOString().split("T")[0];
    let comment = node.comment? `<span class="backup-comment">${node.comment}</span>`: "";

    node.alt_name = `${node.name} [${date}]`;

    jnode.id = `${node.uuid}-${node.timestamp}`;
    jnode.text = `<b>${node.name}</b> [${date}] ${comment}`;
    jnode.icon = "/icons/shelf.svg";
    jnode.data = node;
    jnode.parent = "#"

    const fileSize = "File size: " + formatBytes(node.file_size);
    const tooltip = node.comment? node.comment + "\x0A" + fileSize: fileSize;

    jnode.li_attr = {
        class: "show_tooltip",
        title: tooltip
    };

    return jnode;
}

function backupSetStatus(html) {
    $("#backup-status").html(html);
}

function backupUpdateTime() {
    let delta = Date.now() - processingTime;
    $("#backup-processing-time").text(toHHMMSS(delta));
}

function backupUpdateOverallSize() {
    if (overallBackupSize)
        $("#backup-overall-file-size").html(`<b>Overall backup size:</b> ${formatBytes(overallBackupSize)}`);
    else
        $("#backup-overall-file-size").html("&nbsp;");
}

async function populateBackup() {
    const helperApp = await send.helperAppHasVersion({version: "0.3"});

    if (helperApp) {
        await backupListFiles();
        $("#backup-button").attr("disabled", false);
    }
    else {
        backupSetStatus(`<div>Scrapyard <a href="#helperapp">helper application</a> v0.4+ is required</div>`);
        $("#backup-button").attr("disabled", true);
    }
}

let listingBackups = false;
async function backupListFiles() {
    if (!listingBackups) {
        const directory = settings.backup_directory_path();

        try {
            listingBackups = true;
            backupSetStatus("Loading backups...");

            const backups = await send.listBackups({directory});
            if (backups) {
                availableBackups = [];
                for (let [k, v] of Object.entries(backups)) {
                    v.file = k;
                    availableBackups.push(v);
                }

                overallBackupSize = availableBackups.reduce((a, b) => a + b.file_size, 0);

                availableBackups.sort((a, b) => b.timestamp - a.timestamp);
                availableBackups = availableBackups.map(n => backupToJsTreeNode(n));

                backupTree.settings.core.data = availableBackups;
                backupTree.refresh(true);

                backupUpdateOverallSize();
            }
            else {
                backupTree.settings.core.data = [];
                backupTree.refresh(true);
            }
        }
        finally {
            listingBackups = false;
            backupSetStatus("Ready");
        }
    }
}

function filterBackups(text) {
    if (text) {
        text = text.toLowerCase();
        backupTree.settings.core.data =
            availableBackups.filter(b => b.text.replace(/<[^>]+>/g, "").toLowerCase().includes(text));
        backupTree.refresh(true);
    }
    else {
        backupTree.settings.core.data = availableBackups;
        backupTree.refresh(true);
    }
}

async function backupShelf() {
    await settings.load();

    if (!settings.backup_directory_path()) {
        showNotification("Please, specify backup directory path.")
        return;
    }

    backupSetStatus(`<div id="backup-progress-container">Progress:<progress id="backup-progress-bar" max="100" value="0"
                               style="margin-left: 10px; flex-grow: 1;"/></div>
                          <div id="backup-processing-time" style="margin-right: 15px">00:00</div>`);

    send.startProcessingIndication({noWait: true});
    processingInterval = setInterval(backupUpdateTime, 1000);
    processingTime = Date.now();

    const compress = !!$("#compress-backup:checked").length;

    let exportListener = message => {
        if (message.type === "EXPORT_PROGRESS") {
            if (message.finished) {
                if (compress) {
                    $("#backup-progress-container").remove();
                    $("#backup-status").prepend(`<span>Compressing...</span>`);
                }
            }
            else
                $("#backup-progress-bar").val(message.progress);
        }
    };

    browser.runtime.onMessage.addListener(exportListener);

    try {
        backupIsInProcess = true;
        $("#backup-button").prop("disabled", true);

        await send.backupShelf({
            directory: settings.backup_directory_path(),
            shelf: $("#backup-shelf option:selected").text(),
            comment: $("#backup-comment").val(),
            compress,
            method: settings.backup_compression_method() || "DEFLATE",
            level: settings.backup_compression_level() || "5"
        });

        await backupListFiles();
    }
    catch (e) {
        console.error(e);
        showNotification("Backup has failed: " + e.message);
    }
    finally {
        browser.runtime.onMessage.removeListener(exportListener);
        $("#backup-button").prop("disabled", false);
        send.stopProcessingIndication();
        clearInterval(processingInterval);
        backupIsInProcess = false;
        backupSetStatus("Ready");
    }
}

async function restoreShelf(jnode, newShelf) {
    const shelves = await backend.queryShelf();
    const backupName = newShelf? jnode.data.alt_name: jnode.data.name;

    shelves.push({name: EVERYTHING});

    if (shelves.find(s => s.name.toLowerCase() === backupName.toLowerCase())) {
        if (!await confirm("Warning", `This will replace "${backupName}". Continue?`))
            return;
    }

    const PROGRESS_BAR_HTML = `Progress: <progress id=\"backup-progress-bar\" max=\"100\"
                                               value=\"0\" style=\"margin-left: 10px; flex-grow: 1;\"/>`;

    let progressIndication = false;
    let importListener = message => {
        if (message.type === "IMPORT_INITIALIZING_TRANSACTION") {
            $("#backup-progress-container").html("Saving database state...");
        }
        else if (message.type === "IMPORT_FINALIZING_TRANSACTION") {
            $("#backup-progress-container").html("Cleaning up...");
        }
        else if (message.type === "IMPORT_ROLLING_BACK") {
            $("#backup-progress-container").html("Restoring database...");
        }
        else if (message.type === "IMPORT_PROGRESS") {
            if (!progressIndication) {
                $("#backup-progress-container").html(PROGRESS_BAR_HTML);
                progressIndication = true;
            }
            const bar = $("#backup-progress-bar");
            bar.val(message.progress);
        }
    };

    browser.runtime.onMessage.addListener(importListener);

    processingInterval = setInterval(backupUpdateTime, 1000);
    processingTime = Date.now();

    const statusHTML =
        settings.undo_failed_imports()
            ? "Initializing..."
            : PROGRESS_BAR_HTML;

    backupSetStatus(`<div id="backup-progress-container">${statusHTML}</div>
                          <div id="backup-processing-time" style="margin-right: 15px">00:00</div>`);

    try {
        restoreIsInProcess = true;
        $("#backup-button").prop("disabled", true);

        await send.restoreShelf({
            directory: settings.backup_directory_path(),
            meta: jnode.data,
            new_shelf: newShelf
        });
    }
    catch (e) {
        console.error(e);
        showNotification("Restore has failed: " + e.message);
    }
    finally {
        browser.runtime.onMessage.removeListener(importListener);
        $("#backup-button").prop("disabled", false);
        clearInterval(processingInterval);
        backupSetStatus("Ready");
        restoreIsInProcess = false;
    }
}

async function deleteBackups() {
    if (!await confirm("Warning", "Delete the selected backups?"))
        return;

    const selected = backupTree.get_selected(true);

    for (let jnode of selected) {
        const success = await send.deleteBackup({
            directory: settings.backup_directory_path(),
            meta: jnode.data
        });

        if (success) {
            overallBackupSize -= jnode.data.file_size;
            backupTree.delete_node(jnode);
        }
    }

    backupUpdateOverallSize();
}
