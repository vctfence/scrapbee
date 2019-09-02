import {backend, cloudBackend, dropboxBackend} from "./backend.js"
import {settings} from "./settings.js"
import {parseHtml, showNotification, getFavicon} from "./utils.js";
import {
    DEFAULT_SHELF_NAME,
    EVERYTHING,
    EVERYTHING_SHELF, FIREFOX_SHELF_ID,
    NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK,
    isSpecialShelf
} from "./db.js";

window.onload = function(){
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();

    $("#div-page").css("display", "table-row");

    let darkStyle;

    /** help mark */
    $(".help-mark").hover(function(e){
        $(this).next(".tips.hide").show().css({left: (e.pageX )+"px", top: (e.pageY) +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });

    function switchPane(){
        $(".div-area").hide();
        $("a.left-index").removeClass("focus")

        let m;
        if(m = location.href.match(/#(\w+)$/)) {
            $("#div-" + m[1]).show();
            $("a.left-index[href='#" + m[1] + "']").addClass("focus")
        } else{
            $("#div-settings").show();
            $("a.left-index[href='#settings']").addClass("focus")
        }
    }
    window.onhashchange = switchPane;
    switchPane();

    $("#copy-style-link").on("click", onCopyStyle);
    $("#start-rdf-import").on("click", onStartRDFImport);

    $("#auth-dropbox").on("click", async () => {
        console.log("uuu")
        await dropboxBackend.authenticate(!dropboxBackend.isAuthenticated());
        $("#auth-dropbox").val(dropboxBackend.isAuthenticated()? "Sign out": "Sign in");

    });

    document.getElementById("options-save-button").addEventListener("click",onClickSave,false);
    
    let _ = (v, d) => {return v !== undefined? v: d;};

    chrome.storage.local.get("savepage-settings",
        function(object)
        {
            object = object["savepage-settings"];

            /* General options */

            // document.getElementById("options-newbuttonaction").elements["action"].value = object["options-newbuttonaction"];
            //
            // document.getElementById("options-showsubmenu").checked = object["options-showsubmenu"];
            //document.getElementById("options-showwarning").checked = _(object["options-showwarning"], true);
            ///document.getElementById("options-showurllist").checked = _(object["options-showurllist"], false);
            // document.getElementById("options-promptcomments").checked = object["options-promptcomments"];
            //
            // document.getElementById("options-usepageloader").checked = object["options-usepageloader"];
            document.getElementById("options-retaincrossframes").checked = _(object["options-retaincrossframes"], true);
            document.getElementById("options-removeunsavedurls").checked = _(object["options-removeunsavedurls"], true);
            document.getElementById("options-mergecssimages").checked = _(object["options-mergecssimages"], true);
            // document.getElementById("options-includeinfobar").checked = object["options-includeinfobar"];
            // document.getElementById("options-includesummary").checked = object["options-includesummary"];
            // document.getElementById("options-formathtml").checked = object["options-formathtml"];
            //
            // document.getElementById("options-savedfilename").value = object["options-savedfilename"];
            // document.getElementById("options-replacespaces").checked = object["options-replacespaces"];
            // document.getElementById("options-replacechar").value = object["options-replacechar"];
            // document.getElementById("options-maxfilenamelength").value = object["options-maxfilenamelength"];
            //
            // document.getElementById("options-replacechar").disabled = !document.getElementById("options-replacespaces").checked;
            //
            // /* Saved Items options */
            //
            document.getElementById("options-savehtmlaudiovideo").checked = _(object["options-savehtmlaudiovideo"], true);
            document.getElementById("options-savehtmlobjectembed").checked = _(object["options-savehtmlobjectembed"], true);
            document.getElementById("options-savehtmlimagesall").checked = _(object["options-savehtmlimagesall"], true);
            document.getElementById("options-savecssimagesall").checked = _(object["options-savecssimagesall"], true);
            document.getElementById("options-savecssfontswoff").checked = _(object["options-savecssfontswoff"], true);
            document.getElementById("options-savecssfontsall").checked = _(object["options-savecssfontsall"], true);
            // document.getElementById("options-savescripts").checked = object["options-savescripts"];
            //
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
            document.getElementById("options-purgeelements").checked = _(object["options-purgeelements"], false);
        });

         document.getElementById("options-savecssfontsall").addEventListener("click", function () {
         document.getElementById("options-savecssfontswoff").disabled = document.getElementById("options-savecssfontsall").checked;
    },false);

    settings.load(() => {
        document.getElementById("option-shallow-export").checked = settings.shallow_export();
        //document.getElementById("option-compress-export").checked = settings.compress_export();
        document.getElementById("option-show-firefox-bookmarks").checked = _(settings.show_firefox_bookmarks(), true);
        document.getElementById("option-show-firefox-bookmarks-toolbar").checked = settings.show_firefox_toolbar();
        document.getElementById("option-show-firefox-bookmarks-mobile").checked = settings.show_firefox_mobile();
        document.getElementById("option-switch-to-bookmark").checked = settings.switch_to_new_bookmark();
        document.getElementById("option-do-not-switch-to-ff-bookmark").checked = settings.do_not_switch_to_ff_bookmark();
        document.getElementById("option-capitalize-builtin-shelf-names").checked = settings.capitalize_builtin_shelf_names();
        document.getElementById("option-export-format").value = _(settings.export_format(), "json");

        document.getElementById("option-enable-cloud").checked = settings.cloud_enabled();

        $("#option-enable-cloud").on("change", e => {
            settings.cloud_enabled(e.target.checked,
                async () => {
                    if (e.target.checked)
                        await cloudBackend.authenticate();
                    browser.runtime.sendMessage({type: "RECONCILE_CLOUD_BOOKMARK_DB"})
                });
        });

        document.getElementById("option-cloud-background-sync").checked = settings.cloud_background_sync();

        $("#option-cloud-background-sync").on("change", e => {
            settings.cloud_background_sync(e.target.checked,
                () => browser.runtime.sendMessage({type: "ENABLE_CLOUD_BACKGROUND_SYNC"}));
        });

        initLinkChecker();

        if (dropboxBackend.isAuthenticated())
            $("#auth-dropbox").val("Sign out");
    });

    fetch("_locales/en/help.html").then(response => {
        return response.text();
    }).then(text => {
        $("#div-help").html(text);
    });

    fetch("shadowfox/userContent.css").then(response => {
        return response.text();
    }).then(text => {
        darkStyle = text.replace(/%%%/g, browser.runtime.getURL("/"));
    });

    function onClickSave(event)
    {
        //document.getElementById("options-save-button").value = "Saved";
        //document.getElementById("options-save-button").style.setProperty("font-weight","bold","");

        $("#options-save-button").addClass("flash-button");

        setTimeout(function()
            {
                //document.getElementById("options-save-button").value = "Save";
                //document.getElementById("options-save-button").style.setProperty("font-weight","normal","");

                $("#options-save-button").removeClass("flash-button");
            }
            ,1000);

        chrome.storage.local.set({"savepage-settings":
            {
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
                //"options-savescripts": document.getElementById("options-savescripts").checked,

                /* Advanced options */

                "options-maxframedepth": +document.getElementById("options-maxframedepth").value,
                "options-maxresourcesize": +document.getElementById("options-maxresourcesize").value,
                "options-maxresourcetime": +document.getElementById("options-maxresourcetime").value,
                "options-allowpassive": document.getElementById("options-allowpassive").checked,
                "options-refererheader": +document.getElementById("options-refererheader").elements["header"].value,
                "options-forcelazyloads": document.getElementById("options-forcelazyloads").checked,
                "options-purgeelements": document.getElementById("options-purgeelements").checked
            }});


        settings.shallow_export(document.getElementById("option-shallow-export").checked);
        //settings.compress_export(document.getElementById("option-compress-export").checked);
        settings.show_firefox_bookmarks(document.getElementById("option-show-firefox-bookmarks").checked,
            () => browser.runtime.sendMessage({type: "RECONCILE_BROWSER_BOOKMARK_DB"}));
        settings.show_firefox_toolbar(document.getElementById("option-show-firefox-bookmarks-toolbar").checked);
        settings.show_firefox_mobile(document.getElementById("option-show-firefox-bookmarks-mobile").checked);
        settings.switch_to_new_bookmark(document.getElementById("option-switch-to-bookmark").checked);
        settings.do_not_switch_to_ff_bookmark(document.getElementById("option-do-not-switch-to-ff-bookmark").checked);
        settings.capitalize_builtin_shelf_names(document.getElementById("option-capitalize-builtin-shelf-names").checked,
            () => browser.runtime.sendMessage({type: "SHELVES_CHANGED"}));
        settings.export_format(document.getElementById("option-export-format").value);
    }

    function onCopyStyle(e) {
        navigator.clipboard.writeText(darkStyle);
        showNotification({message: "Dark theme style is copied to Clipboard."});
    }

    let importing = false;
    $("#invalid-imports-container").on("click", ".invalid-import", selectNode);
    async function onStartRDFImport(e) {
        let finalize = () => {
            browser.runtime.onMessage.removeListener(progressListener);

            $("#start-rdf-import").val("Import");
            $("#rdf-shelf-name").prop('disabled', false);
            $("#rdf-import-path").prop('disabled', false);
            $("#rdf-import-threads").prop('disabled', false);

            $("#rdf-progress-row").text("ready");
            importing = false;
        };

        let shelf = $("#rdf-shelf-name").val();
        let path = $("#rdf-import-path").val();

        if (importing) {
            browser.runtime.sendMessage({type: "CANCEL_RDF_IMPORT"});
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

        let progressListener = message => {
            if (message.type === "RDF_IMPORT_PROGRESS") {
                let bar = $("#rdf-import-progress");
                if (!bar.length) {
                    bar = $(`<progress id="rdf-import-progress" max="100" value="0"/>`);
                    progress_row.empty().append(bar);
                }
                bar.val(message.progress);
            }
            else if (message.type === "RDF_IMPORT_ERROR") {
                let invalid_link = `<a href="${message.index}" tarket="_blank" data-id="${message.bookmark.id}" 
                                       class="invalid-import">${message.bookmark.name}</a>`;
                $("#invalid-imports-container").show();
                $("#invalid-imports").append(`<tr><td>${message.error}</td><td>${invalid_link}</td></tr>`);
            }
        };

        browser.runtime.onMessage.addListener(progressListener);

        browser.runtime.sendMessage({type: "IMPORT_FILE", file: path, file_name: shelf, file_ext: "RDF",
                                     threads: $("#rdf-import-threads").val(),
                                     quick: $("#rdf-import-quick").is(':checked')})
            .then(finalize)
            .catch(e => {
                showNotification({message: e.message});
                finalize();
            });
    }

    let abort_check_links = false;
    let link_scope = $("#link-scope");
    let initLinkChecker = () => {
        $("#start-check-links").on("click", startCheckLinks);
        $("#invalid-links-container").on("click", ".invalid-link", selectNode);

        link_scope.html(`
        <option class="option-builtin divide" value="${EVERYTHING_SHELF}">${
            settings.capitalize_builtin_shelf_names()? EVERYTHING.capitalizeFirstLetter(): EVERYTHING
            }</option>
        `);

        backend.listShelves().then(shelves => {
            shelves.sort((a, b) => {
                if (a.name < b.name)
                    return -1;
                if (a.name > b.name)
                    return 1;

                return 0;
            });

            let default_shelf = shelves.find(s => s.name === DEFAULT_SHELF_NAME);
            shelves.splice(shelves.indexOf(default_shelf), 1);

            let browser_bookmarks_shelf = shelves.find(s => s.id === FIREFOX_SHELF_ID);
            shelves.splice(shelves.indexOf(browser_bookmarks_shelf), 1);

            shelves = [default_shelf, ...shelves];

            for (let shelf of shelves) {
                let name =
                    isSpecialShelf(shelf.name)
                        ? (settings.capitalize_builtin_shelf_names()? shelf.name.capitalizeFirstLetter(): shelf.name)
                        : shelf.name;
                $("<option></option>").appendTo(link_scope).html(name).attr("value", shelf.id);
            }
        });
    };

    function stopCheckLinks() {
        $("#start-check-links").val("Check");
        $("#current-link-title").text("");
        $("#current-link-url").text("");
        $("#current-link").css("visibility", "hidden");
        abort_check_links = false;
    }

    function startCheckLinks() {
        if ($("#start-check-links").val() === "Check") {

            $("#start-check-links").val("Stop");

            let timeout = parseInt($("#link-check-timeout").val()) * 1000;
            let update_icons = $("#update-icons").is(":checked");
            let scope = $(`#link-scope option[value='${link_scope.val()}']`).text();
            let path = scope === EVERYTHING ? undefined : scope;

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
                        xhr.timeout = timeout;
                        xhr.ontimeout = function () {this._timedout = true};
                        xhr.onerror = function (e) {console.log(e)};
                        xhr.onloadend = function (e) {
                            if (!this.status || this.status >= 400) {
                                $("#invalid-links-container").show();

                                let error = this.status
                                    ? `[HTTP Error: ${this.status}]`
                                    : (this._timedout? "[Timeout]": "[Unavailable]");

                                let invalid_link = `<a href="#" data-id="${node.id}" class="invalid-link">${node.name}</a>`
                                $("#invalid-links").append(`<tr><td>${error}</td><td>${invalid_link}</td></tr>`);
                            }
                            else if (update_icons) {
                                let link;
                                let base = new URL(node.uri).origin;
                                let type = this.getResponseHeader("Content-Type");

                                if (type && type.toLowerCase().startsWith("text/html")) {

                                    let doc = parseHtml(this.responseText);
                                    link = doc.querySelector("head link[rel*='icon'], head link[rel*='shortcut']");

                                    if (link) {
                                       link = new URL(link.href, base).toString();
                                    }
                                }

                                if (link) {
                                    node.icon = link;
                                    backend.updateNode(node);
                                }
                                else {
                                    link = base + "/favicon.ico";
                                    fetch(link, {method: "GET"}).then(response => {
                                        let type = response.headers.get("content-type") || "image";
                                        if (response.ok && type.startsWith("image"))
                                            return response.arrayBuffer().then(bytes => {
                                                node.icon = bytes.byteLength? link: undefined;
                                                backend.updateNode(node);
                                            });
                                    }).catch(() => {
                                        node.icon = undefined;
                                        backend.updateNode(node);
                                    });
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

    function selectNode(e) {
        e.preventDefault();
        browser.runtime.sendMessage({type: "SELECT_NODE", node: {id: parseInt(e.target.getAttribute("data-id"))}});
    }
};
