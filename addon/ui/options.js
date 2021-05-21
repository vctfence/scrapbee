import {send} from "../proxy.js";
import {backend, loadShelfListOptions} from "../backend.js"
import {cloudBackend} from "../backend_cloud.js"
import {dropboxBackend} from "../backend_dropbox.js"
import {settings} from "../settings.js"
import {formatBytes, toHHMMSS} from "../utils.js";
import {
    isSpecialShelf,
    CLOUD_SHELF_NAME,
    EVERYTHING,
    FIREFOX_SHELF_NAME,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK
} from "../storage_constants.js";
import {testFavicon} from "../favicon.js";
import {parseHtml} from "../utils_html.js";
import {showNotification} from "../utils_browser.js";
import {fetchText} from "../utils_io.js";

let _ = (v, d) => {return v !== undefined? v: d;};

function loadSavePageSettings() {
    chrome.storage.local.get("savepage-settings",
        function(object) {
            object = object["savepage-settings"];

            /* General options */

            // document.getElementById("options-usepageloader").checked = object["options-usepageloader"];
            document.getElementById("options-retaincrossframes").checked = _(object["options-retaincrossframes"], true);
            document.getElementById("options-removeunsavedurls").checked = _(object["options-removeunsavedurls"], true);
            document.getElementById("options-mergecssimages").checked = _(object["options-mergecssimages"], true);
            // document.getElementById("options-formathtml").checked = object["options-formathtml"];
            // document.getElementById("options-savedfilename").value = object["options-savedfilename"];
            // document.getElementById("options-replacespaces").checked = object["options-replacespaces"];
            //
            // /* Saved Items options */
            //
            document.getElementById("options-savehtmlaudiovideo").checked = _(object["options-savehtmlaudiovideo"], true);
            document.getElementById("options-savehtmlobjectembed").checked = _(object["options-savehtmlobjectembed"], true);
            document.getElementById("options-savehtmlimagesall").checked = _(object["options-savehtmlimagesall"], true);
            document.getElementById("options-savecssimagesall").checked = _(object["options-savecssimagesall"], true);
            document.getElementById("options-savecssfontswoff").checked = _(object["options-savecssfontswoff"], true);
            document.getElementById("options-savecssfontsall").checked = _(object["options-savecssfontsall"], true);
            document.getElementById("options-savescripts").checked = object["options-savescripts"];
            document.getElementById("options-savecssfontswoff").disabled = document.getElementById("options-savecssfontsall").checked;
            //
            // /* Advanced options */
            //
            document.getElementById("options-maxframedepth").value = _(object["options-maxframedepth"], 5);
            document.getElementById("options-maxresourcesize").value = _(object["options-maxresourcesize"], 5);
            document.getElementById("options-maxresourcetime").value = _(object["options-maxresourcetime"], 30);
            document.getElementById("options-allowpassive").checked = _(object["options-allowpassive"], false);
            document.getElementById("options-refererheader").elements["header"].value = _(object["options-refererheader"], 0);
            document.getElementById("options-forcelazyloads").checked = _(object["options-forcelazyloads"], false);
            document.getElementById("options-purgeelements").checked = _(object["options-purgeelements"], true);
        });

    document.getElementById("options-savecssfontsall").addEventListener("click", function () {
        document.getElementById("options-savecssfontswoff").disabled = document.getElementById("options-savecssfontsall").checked;
    },false);
}

function storeSavePageSettings() {
    chrome.storage.local.set({"savepage-settings": {
        /* General options */

        //"options-showwarning": document.getElementById("options-showwarning").checked,
        //"options-showurllist": document.getElementById("options-showurllist").checked,
        //"options-promptcomments": document.getElementById("options-promptcomments").checked,

        //"options-usepageloader": document.getElementById("options-usepageloader").checked,
        "options-retaincrossframes": document.getElementById("options-retaincrossframes").checked,
        "options-removeunsavedurls": document.getElementById("options-removeunsavedurls").checked,
        "options-mergecssimages": document.getElementById("options-mergecssimages").checked,
        //"options-includeinfobar": document.getElementById("options-includeinfobar").checked,
        //"options-includesummary": document.getElementById("options-includesummary").checked,
        //"options-formathtml": document.getElementById("options-formathtml").checked,

        /* Saved Items options */

        "options-savehtmlaudiovideo": document.getElementById("options-savehtmlaudiovideo").checked,
        "options-savehtmlobjectembed": document.getElementById("options-savehtmlobjectembed").checked,
        "options-savehtmlimagesall": document.getElementById("options-savehtmlimagesall").checked,
        "options-savecssimagesall": document.getElementById("options-savecssimagesall").checked,
        "options-savecssfontswoff": document.getElementById("options-savecssfontswoff").checked,
        "options-savecssfontsall": document.getElementById("options-savecssfontsall").checked,
        "options-savescripts": document.getElementById("options-savescripts").checked,

        /* Advanced options */

        "options-maxframedepth": +document.getElementById("options-maxframedepth").value,
        "options-maxresourcesize": +document.getElementById("options-maxresourcesize").value,
        "options-maxresourcetime": +document.getElementById("options-maxresourcetime").value,
        "options-allowpassive": document.getElementById("options-allowpassive").checked,
        "options-refererheader": +document.getElementById("options-refererheader").elements["header"].value,
        "options-forcelazyloads": document.getElementById("options-forcelazyloads").checked,
        "options-loadlazycontent": document.getElementById("options-forcelazyloads").checked,
        "options-purgeelements": document.getElementById("options-purgeelements").checked,
        "options-removeelements": document.getElementById("options-purgeelements").checked
    }});
}

function loadScrapyardSettings() {
    document.getElementById("option-shelf-list-max-height").value = _(settings.shelf_list_height(), 600);
    document.getElementById("option-show-firefox-bookmarks").checked = _(settings.show_firefox_bookmarks(), true);
    document.getElementById("option-show-firefox-bookmarks-toolbar").checked = settings.show_firefox_toolbar();
    document.getElementById("option-show-firefox-bookmarks-mobile").checked = settings.show_firefox_mobile();
    document.getElementById("option-switch-to-bookmark").checked = settings.switch_to_new_bookmark();
    document.getElementById("option-do-not-show-archive-toolbar").checked = settings.do_not_show_archive_toolbar();
    document.getElementById("option-do-not-switch-to-ff-bookmark").checked = settings.do_not_switch_to_ff_bookmark();
    document.getElementById("option-display-random-bookmark").checked = settings.display_random_bookmark();
    document.getElementById("option-open-bookmark-in-active-tab").checked = settings.open_bookmark_in_active_tab();
    document.getElementById("option-capitalize-builtin-shelf-names").checked = settings.capitalize_builtin_shelf_names();
    document.getElementById("option-export-format").value = _(settings.export_format(), "json");
    document.getElementById("option-use-helper-app-for-export").checked = settings.use_helper_app_for_export();
    document.getElementById("option-browse-with-helper").checked = _(settings.browse_with_helper(), false);
    document.getElementById("option-helper-port").value = _(settings.helper_port_number(), 20202);

    document.getElementById("option-enable-cloud").checked = settings.cloud_enabled();

    $("#option-enable-cloud").on("change", async e => {
        await settings.load();

        settings.cloud_enabled(e.target.checked,
            async () => {
                if (e.target.checked) {
                    const success = await cloudBackend.authenticate();
                    if (success)
                        $("#auth-dropbox").val("Sign out");
                }
                send.reconcileCloudBookmarkDb()
            });
    });

    document.getElementById("option-cloud-background-sync").checked = settings.cloud_background_sync();

    $("#option-cloud-background-sync").on("change", async e => {
        await settings.load();

        settings.cloud_background_sync(e.target.checked,
            () => send.enableCloudBackgroundSync());
    });

    if (dropboxBackend.isAuthenticated())
        $("#auth-dropbox").val("Sign out");

    $("#auth-dropbox").on("click", async () => {
        await dropboxBackend.authenticate(!dropboxBackend.isAuthenticated());
        $("#auth-dropbox").val(dropboxBackend.isAuthenticated()? "Sign out": "Sign in");
    });

    document.getElementById("option-sidebar-theme").value = localStorage.getItem("scrapyard-sidebar-theme") || "light";
}

async function storeScrapyardSettings() {
    await settings.load();

    const currentSidebarHeight = settings.shelf_list_height();
    const newSidebarHeight = parseInt(document.getElementById("option-shelf-list-max-height").value);
    if (currentSidebarHeight !== newSidebarHeight)
        settings.shelf_list_height(newSidebarHeight, () => send.reloadSidebar({height: newSidebarHeight}));

    settings.show_firefox_toolbar(document.getElementById("option-show-firefox-bookmarks-toolbar").checked);
    settings.show_firefox_mobile(document.getElementById("option-show-firefox-bookmarks-mobile").checked);
    settings.capitalize_builtin_shelf_names(document.getElementById("option-capitalize-builtin-shelf-names").checked,
        () => send.shelvesChanged());
    settings.show_firefox_bookmarks(document.getElementById("option-show-firefox-bookmarks").checked,
        () => send.reconcileBrowserBookmarkDb());
    settings.do_not_show_archive_toolbar(document.getElementById("option-do-not-show-archive-toolbar").checked);
    settings.switch_to_new_bookmark(document.getElementById("option-switch-to-bookmark").checked);
    settings.open_bookmark_in_active_tab(document.getElementById("option-open-bookmark-in-active-tab").checked);
    settings.do_not_switch_to_ff_bookmark(document.getElementById("option-do-not-switch-to-ff-bookmark").checked);
    settings.export_format(document.getElementById("option-export-format").value);
    settings.use_helper_app_for_export(document.getElementById("option-use-helper-app-for-export").checked);
    settings.browse_with_helper(document.getElementById("option-browse-with-helper").checked);
    settings.helper_port_number(parseInt(document.getElementById("option-helper-port").value));

    const displayRandomBookmark = document.getElementById("option-display-random-bookmark").checked;
    if (displayRandomBookmark !== settings.display_random_bookmark())
        settings.display_random_bookmark(displayRandomBookmark,
            () => send.displayRandomBookmark({display: displayRandomBookmark}));

    const currentSidebarTheme = localStorage.getItem("scrapyard-sidebar-theme");
    const newSidebarTheme = document.getElementById("option-sidebar-theme").value;
    localStorage.setItem("scrapyard-sidebar-theme", newSidebarTheme);

    if (currentSidebarTheme !== newSidebarTheme)
        send.sidebarThemeChanged({theme: newSidebarTheme});
}

let helperAppLinksLoaded = false;
function loadHelperAppLinks() {
    if (helperAppLinksLoaded)
        return;

    // Load helper app links
    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = async function () {
        if (this.readyState == 4 && this.status == 200) {
            let release = JSON.parse(this.responseText);
            let link = document.getElementById("helper-windows-inst");
            link.href = release.assets[0].browser_download_url;
            link = document.getElementById("helper-manual-inst");
            link.href = release.assets[1].browser_download_url;
            helperAppLinksLoaded = true;

            let version = release.name.split(" ");
            version = version[version.length - 1];

            $("#helper-app-version").html(`<b>Latest version:</b> ${version}`);

            const installedVersion = await send.helperAppGetVersion();
            const INSTALLED_VERSION_TEXT = `<b>Installed version:</b> %%%`;

            if (installedVersion)
                $("#helper-app-version-installed").html(INSTALLED_VERSION_TEXT
                    .replace("%%%", "v" + installedVersion));
            else
                $("#helper-app-version-installed").html(INSTALLED_VERSION_TEXT
                    .replace("%%%", "not installed"));
        }
    };
    xhr.open('GET', 'https://api.github.com/repos/gchristensen/scrapyard/releases/latest');
    xhr.send();
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

window.onload = async function() {
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();

    await settings.load();

    initHelpMarks();

    window.onhashchange = switchPane;
    switchPane();

    $("#div-page").css("display", "table-row");

    document.getElementById("options-save-button").addEventListener("click", onClickSave,false);
    document.getElementById("options-save2-button").addEventListener("click", onClickSave,false);

    loadSavePageSettings();
    loadScrapyardSettings();

    function onClickSave(event)
    {
        $(event.target).addClass("flash-button");

        setTimeout(function() {
                $(event.target).removeClass("flash-button");
            },1000);

        if (event.target.id === "options-save-button")
            storeScrapyardSettings();
        else
            storeSavePageSettings();
    }

    // Import RDF //////////////////////////////////////////////////////////////////////////////////////////////////////

    $("#invalid-imports-container").on("click", ".invalid-import", selectNode);
    $("#start-rdf-import").on("click", onStartRDFImport);

    // Link Checker/////////////////////////////////////////////////////////////////////////////////////////////////////

    initializeLinkChecker();
    doAutoStartCheckLinks();

    // Backup //////////////////////////////////////////////////////////////////////////////////////////////////////////

    initializeBackup();
};

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

let abort_check_links = false;

let autoStartCheckLinks;
let autoLinkCheckScope;
async function doAutoStartCheckLinks() {
    const urlParams = new URLSearchParams(window.location.search);
    autoStartCheckLinks = !!urlParams.get("menu");

    if (autoStartCheckLinks) {
        $("#update-icons").prop("checked", urlParams.get("repairIcons") === "true");
        let scopePath = await backend.computePath(parseInt(urlParams.get("scope")));
        $("#link-scope").replaceWith(scopePath[scopePath.length - 1].name + "&nbsp;&nbsp;");
        autoLinkCheckScope = scopePath.map(g => g.name).join("/");
        startCheckLinks();
    }
}

function initializeLinkChecker() {
    $("#start-check-links").on("click", startCheckLinks);
    $("#invalid-links-container").on("click", ".invalid-link", selectNode);

    loadShelfListOptions("#link-scope");
}

function stopCheckLinks() {
    $("#start-check-links").val("Check");
    $("#current-link-title").text("");
    $("#current-link-url").text("");
    $("#current-link").css("visibility", "hidden");
    abort_check_links = false;

    if ($("#update-icons").is(":checked")) {
        setTimeout(() => send.nodesUpdated(), 500);
    }
}

function startCheckLinks() {
    if ($("#start-check-links").val() === "Check") {

        $("#start-check-links").val("Stop");

        let update_icons = $("#update-icons").is(":checked");
        let path;

        if (autoStartCheckLinks) {
            path = autoLinkCheckScope;
        }
        else {
            let scope = $(`#link-scope option[value='${$("#link-scope").val()}']`).text();
            path = scope === EVERYTHING ? undefined : scope;
        }

        $("#current-link").css("visibility", "visible");
        $("#invalid-links-container").hide();
        $("#invalid-links").html("");

        let checkNodes = function (nodes) {
            let node = nodes.shift();
            if (node && !abort_check_links) {
                if (node.uri) {
                    $("#current-link-title").text(node.name);
                    $("#current-link-url").text(node.uri);

                    let xhr = new XMLHttpRequest();
                    xhr.open("GET", node.uri);
                    xhr.timeout = parseInt($("#link-check-timeout").val()) * 1000;
                    xhr.ontimeout = function () {this._timedout = true};
                    xhr.onerror = function (e) {console.error(e)};
                    xhr.onloadend = async function (e) {
                        if (!this.status || this.status >= 400) {
                            $("#invalid-links-container").show();

                            let error = this.status
                                ? `[HTTP Error: ${this.status}]`
                                : (this._timedout? "[Timeout]": "[Unavailable]");

                            let invalid_link = `<a href="#" data-id="${node.id}" class="invalid-link">${node.name}</a>`
                            $("#invalid-links").append(`<tr><td>${error}</td><td>${invalid_link}</td></tr>`);

                            if (update_icons && !node.stored_icon && !this.status) {
                                node.icon = null;
                                await backend.updateNode(node);
                            }
                        }

                        if (this.status && update_icons) {
                            let favicon;
                            let base = new URL(node.uri).origin;

                            let type = this.getResponseHeader("Content-Type");

                            if (type && type.toLowerCase().startsWith("text/html")) {
                                let doc = parseHtml(this.responseText);
                                let faviconElt = doc.querySelector("link[rel*='icon'], link[rel*='shortcut']");

                                if (faviconElt)
                                    favicon = await testFavicon(new URL(faviconElt.href, base));
                            }

                            if (favicon) {
                                node.icon = favicon;
                                await backend.updateNode(node);
                                await backend.storeIcon(node);
                            }
                            else {
                                try {
                                    let url = base + "/favicon.ico";
                                    let response = await fetch(url, {method: "GET"});
                                    if (response.ok) {
                                        let type = response.headers.get("content-type") || "image";
                                        if (type.startsWith("image")) {
                                            const buffer = await response.arrayBuffer();
                                            if (buffer.byteLength) {
                                                node.icon = favicon = url;
                                                await backend.updateNode(node);
                                                await backend.storeIcon(node, buffer, type);
                                            }
                                        }
                                    }
                                } catch (e) {
                                    console.error(e)
                                }
                            }

                            if (!favicon && !node.stored_icon) {
                                node.icon = null;
                                await backend.updateNode(node);
                            }
                        }

                        checkNodes(nodes);
                    };
                    xhr.send();
                } else
                    checkNodes(nodes);
            }
            else if (abort_check_links)
                abort_check_links = false;
            else
                stopCheckLinks();
        };

        backend.listNodes({path: path, types: [NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK]}).then(nodes => {
            checkNodes(nodes);
        });
    }
    else {
        stopCheckLinks();
        abort_check_links = true;
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

    loadShelfListOptions("#backup-shelf");

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
        return name === FIREFOX_SHELF_NAME || name === CLOUD_SHELF_NAME || selected?.length > 1;
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

    send.startProcessingIndication({no_wait: true});
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
    }
}

async function restoreShelf(jnode, newShelf) {
    const shelves = await backend.queryShelf();
    const backupName = newShelf? jnode.data.alt_name: jnode.data.name;

    shelves.push({name: EVERYTHING});

    if (shelves.find(s => s.name.toLowerCase() === backupName.toLowerCase())) {
        if (!confirm(`This will replace "${backupName}". Continue?`))
            return;
    }

    let importListener = message => {
        if (message.type === "IMPORT_PROGRESS") {
            let bar = $("#backup-progress-bar");
            bar.val(message.progress);
        }
    };

    browser.runtime.onMessage.addListener(importListener);

    backupSetStatus(`Progress: <progress id="backup-progress-bar" max="100" value="0" style="flex-grow: 1;"/>
                            <div id="backup-processing-time" style="margin-right: 15px">00:00</div>`)

    processingInterval = setInterval(backupUpdateTime, 1000);
    processingTime = Date.now();

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
    if (!confirm(`Delete the selected backups?`))
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
