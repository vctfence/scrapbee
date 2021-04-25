import {send} from "./proxy.js";
import {backend} from "./backend.js"
import {cloudBackend} from "./backend_cloud.js"
import {dropboxBackend} from "./backend_dropbox.js"
import {settings} from "./settings.js"
import {loadShelveOptions, parseHtml, showNotification, testFavicon} from "./utils.js";
import {
    DEFAULT_SHELF_NAME,
    EVERYTHING,
    EVERYTHING_SHELF_ID,
    FIREFOX_SHELF_ID,
    NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK,
    isSpecialShelf
} from "./storage_constants.js";
import {nativeBackend} from "./backend_native.js";

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
    settings.load(() => {

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
        document.getElementById("option-shallow-export").checked = settings.shallow_export();
        document.getElementById("option-browse-with-helper").checked = _(settings.browse_with_helper(), false);
        document.getElementById("option-helper-port").value = _(settings.helper_port_number(), 20202);

        document.getElementById("option-enable-cloud").checked = settings.cloud_enabled();

        $("#option-enable-cloud").on("change", e => {
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

        $("#option-cloud-background-sync").on("change", e => {
            settings.cloud_background_sync(e.target.checked,
                () => send.enableCloudBackgroundSync());
        });

        if (dropboxBackend.isAuthenticated())
            $("#auth-dropbox").val("Sign out");

        $("#auth-dropbox").on("click", async () => {
            await dropboxBackend.authenticate(!dropboxBackend.isAuthenticated());
            $("#auth-dropbox").val(dropboxBackend.isAuthenticated()? "Sign out": "Sign in");
        });

        initLinkChecker();
    });

    document.getElementById("option-sidebar-theme").value = localStorage.getItem("scrapyard-sidebar-theme") || "light";
}

function storeScrapyardSettings() {
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
    settings.shallow_export(document.getElementById("option-shallow-export").checked);
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
    xhr.onreadystatechange = function () {
        if (this.readyState == 4 && this.status == 200) {
            let release = JSON.parse(this.responseText);
            let link = document.getElementById("helper-windows-inst");
            link.href = release.assets[0].browser_download_url;
            link = document.getElementById("helper-manual-inst");
            link.href = release.assets[1].browser_download_url;
            helperAppLinksLoaded = true;
        }
    };
    xhr.open('GET', 'https://api.github.com/repos/gchristensen/scrapyard/releases/latest');
    xhr.send();
}

async function configureAboutPage() {
    $("#about-version").text(`Version: ${browser.runtime.getManifest().version}`);
}

function switchPane() {
    $(".div-area").hide();
    $("a.left-index").removeClass("focus")

    let m;
    if(m = location.href.match(/#(\w+)$/)) {

        if (m[1] === "helperapp")
            loadHelperAppLinks();
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

    fetch("help.html").then(response => {
        return response.text();
    }).then(text => {
        $("#div-help").html(text);
    });

    fetch("changes.html").then(response => {
        return response.text();
    }).then(text => {
        $("#about-changes").html(text);
    });

    // Import RDF //////////////////////////////////////////////////////////////////////////////////////////////////////

    $("#invalid-imports-container").on("click", ".invalid-import", selectNode);
    $("#start-rdf-import").on("click", onStartRDFImport);

    // Link Checker/////////////////////////////////////////////////////////////////////////////////////////////////////

    doAutoStartCheckLinks();
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

        $("#rdf-progress-row").text("ready");
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

    let importListener = message => {
        if (message.type === "RDF_IMPORT_PROGRESS") {
            let bar = $("#rdf-import-progress");
            if (!bar.length) {
                bar = $(`<progress id="rdf-import-progress" max="100" value="0"/>`);
                progress_row.empty().append(bar);
            }
            bar.val(message.progress);
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

function initLinkChecker() {
    $("#start-check-links").on("click", startCheckLinks);
    $("#invalid-links-container").on("click", ".invalid-link", selectNode);

    loadShelveOptions("#link-scope");
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
                    xhr.onerror = function (e) {console.log(e)};
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
                                let faviconElt = doc.querySelector("link[rel*='icon'], head link[rel*='shortcut']");

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
