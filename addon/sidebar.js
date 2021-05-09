import {send} from "./proxy.js";
import {settings} from "./settings.js"
import {backend} from "./backend.js"
import {ishellBackend} from "./backend_ishell.js"
import {BookmarkTree} from "./tree.js"
import {showDlg, confirm} from "./dialog.js"

import {
    SearchContext,
    SEARCH_MODE_TITLE, SEARCH_MODE_TAGS, SEARCH_MODE_CONTENT,
    SEARCH_MODE_NOTES, SEARCH_MODE_COMMENTS, SEARCH_MODE_DATE
} from "./search.js";

import {formatShelfName, openPage, pathToNameExt, showNotification} from "./utils.js";
import {
    CLOUD_SHELF_ID, CLOUD_SHELF_NAME,
    DEFAULT_SHELF_ID, DEFAULT_SHELF_NAME,
    DONE_SHELF_NAME, DONE_SHELF_ID,
    EVERYTHING, EVERYTHING_SHELF_ID,
    FIREFOX_SHELF_ID, FIREFOX_SHELF_NAME,
    NODE_TYPE_SHELF, TODO_SHELF_NAME, TODO_SHELF_ID,
    NODE_TYPE_ARCHIVE, NODE_TYPE_NOTES,
    isSpecialShelf, isEndpoint
} from "./storage_constants.js";

const INPUT_TIMEOUT = 1000;

let tree;
let context;
let shelfList;

let randomBookmark;
let randomBookmarkTimeout;

window.onload = async function () {
    /* i18n */
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();

    await settings.load();

    tree = new BookmarkTree("#treeview");
    context = new SearchContext(tree);

    shelfList = $("#shelfList");
    shelfList.selectric({maxHeight: settings.shelf_list_height() || 600, inheritOriginalWidth: true});

    $("#btnLoad").on("click", () => loadShelves());
    $("#btnSearch").on("click", () => openPage("fulltext.html"));
    $("#btnSettings").on("click", () => openPage("options.html"));
    $("#btnHelp").on("click", () => openPage("options.html#help"));

    shelfList.change(function () {
        styleBuiltinShelf();
        switchShelf(this.value, true, true);
    });

    $("#shelf-menu-button").click(() => {
        $("#search-mode-menu").hide();
        $("#shelf-menu").toggle();
    });

    $("#shelf-menu-create").click(() => {
        // TODO: i18n
        showDlg("prompt", {caption: "Create Shelf", label: "Name"})
            .then(data => {
                let name;
                if (name = data.title) {
                    if (!isSpecialShelf(name)) {
                        backend.createGroup(null, name, NODE_TYPE_SHELF)
                            .then(shelf => {
                                if (shelf) {
                                    settings.last_shelf(shelf.id);
                                    loadShelves();
                                }
                            });
                    }
                    else {
                        showNotification({message: "Can not create shelf with this name."})
                    }
                }
            });
    });

    $("#shelf-menu-rename").click(() => {
        let {id, name, option} = getCurrentShelf();

        if (name && !isSpecialShelf(name)) {
            // TODO: 118n
            showDlg("prompt", {caption: "Rename", label: "Name", title: name})
                .then(data => {
                    let newName = data.title;
                    if (newName && !isSpecialShelf(newName)) {
                        backend.renameGroup(id, newName)
                            .then(() => {
                                option.text(newName);
                                tree.renameRoot(newName);

                                shelfList.selectric('refresh');
                            });
                    }
                });
        } else {
            // TODO: i18n
            showNotification({message: "A built-in shelf could not be renamed."});
        }

    });

    $("#shelf-menu-delete").click(() => {
        let {id, name} = getCurrentShelf();

        if (isSpecialShelf(name)) {
            // TODO: i18n
            showNotification({message: "A built-in shelf could not be deleted."})
            return;
        }

        // TODO: 118n
        confirm("{Warning}", "Do you really want to delete '" + name + "'?")
            .then(() => {
                if (name) {
                    send.deleteNodes({node_ids: id}).then(() => {
                        $(`#shelfList option[value="${id}"]`).remove();

                        shelfList.val(DEFAULT_SHELF_ID);
                        shelfList.selectric('refresh');
                        switchShelf(1);
                    });
                }
            });
    });

    $("#shelf-menu-sort").click(async () => {
        let nodes = await backend.queryShelf();
        let special = nodes.filter(n => isSpecialShelf(n.name)).sort((a, b) => a.id - b.id);
        let regular = nodes.filter(n => !isSpecialShelf(n.name)).sort((a, b) => a.name.localeCompare(b.name));
        let sorted = [...special, ...regular];

        let positions = [];
        for (let i = 0; i < sorted.length; ++i)
            positions.push({id: sorted[i].id, pos: i});

        await send.reorderNodes({positions: positions});
        loadShelves(false);
    });

    $("#shelf-menu-import").click(() => $("#file-picker").click());

    $("#file-picker").change(async (e) => {
        if (e.target.files.length > 0) {
            let {name, ext} = pathToNameExt($("#file-picker").val());
            let lname = name.toLocaleLowerCase();

            if (lname === DEFAULT_SHELF_NAME || lname === EVERYTHING || !isSpecialShelf(lname)) {
                let existingOption = $(`#shelfList option`).filter(function(i, e) {
                    return e.textContent.toLocaleLowerCase() === lname;
                });

                if (existingOption.length)
                    confirm("{Warning}", "This will replace '" + name + "'.").then(() => {
                        performImport(e.target.files[0], name, ext).then(() => {
                            $("#file-picker").val("");
                        });
                    });
                else
                    performImport(e.target.files[0], name, ext).then(() => {
                        $("#file-picker").val("");
                    });
            }
            else
                showNotification({message: `Cannot replace '${name}'.`});
        }
    });

    $("#shelf-menu-export").click(() => performExport());

    $("#search-mode-switch").click(() => {
        $("#shelf-menu").hide();
        $("#search-mode-menu").toggle();
    });

    $("#shelf-menu-search-title").click(() => {
        $("#search-mode-switch").prop("src", "icons/bookmark.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_TITLE, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-tags").click(() => {
        $("#search-mode-switch").prop("src", "icons/tags.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_TAGS, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-content").click(() => {
        $("#search-mode-switch").prop("src", "icons/content-web.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_CONTENT, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-notes").click(() => {
        $("#search-mode-switch").prop("src", "icons/content-notes.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_NOTES, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-comments").click(() => {
        $("#search-mode-switch").prop("src", "icons/content-comments.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_COMMENTS, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-date").click(() => {
        $("#search-mode-switch").prop("src", "icons/calendar.svg");
        $("#search-input").attr("placeholder", "examples: 2021-02-24, before 2021-02-24, after 2021-02-24")
        context.setMode(SEARCH_MODE_DATE, getCurrentShelf().name);
        performSearch();
    });

    let timeout;
    $("#search-input").on("input", e => {
        clearTimeout(timeout);

        if (e.target.value) {
            $("#search-input-clear").show();
            timeout = setTimeout(() => {
                performSearch();
            }, INPUT_TIMEOUT);
        }
        else {
            timeout = null;
            performSearch();
            $("#search-input-clear").hide();
        }
    });

    $("#search-input-clear").click(e => {
        $("#search-input").val("");
        $("#search-input-clear").hide();
        $("#search-input").trigger("input");
    });

    $(document).on("click", function(e) {
        if (!e.target.matches("#shelf-menu-button")
            && !e.target.matches("#prop-dlg-containers-icon")
            && !e.target.matches("#search-mode-switch"))
            $(".simple-menu").hide();
    });

    $("#footer-find-btn").click(e => {
        selectNode(randomBookmark);
    });

    $("#footer-reload-btn").click(e => {
        clearTimeout(randomBookmarkTimeout);
        displayRandomBookmark();
    });

    $("#footer-close-btn").click(e => {
        clearTimeout(randomBookmarkTimeout);
        $("#footer").hide();
    });

    $("#btnAnnouncement").click(e => {
        browser.tabs.create({"url": browser.runtime.getURL("options.html#about")});
        $("#btnAnnouncement").hide();
        settings.pending_announcement(false);
    })

    tree.onRenameShelf = node => {
        $(`#shelfList option[value="${node.id}"]`).text(node.name);
        shelfList.selectric('refresh');
    };

    tree.onDeleteShelf = node => {
        $(`#shelfList option[value="${node.id}"]`).remove();
        shelfList.selectric('refresh');

        if (!tree._everything) {
            shelfList.val(DEFAULT_SHELF_ID);
            shelfList.selectric('refresh');
            switchShelf(DEFAULT_SHELF_ID);
        }
    };

    let processing_timeout;
    tree.startProcessingIndication = () => {
        processing_timeout = setTimeout(startProcessingIndication, 1000)
    };
    tree.stopProcessingIndication = () => {
        stopProcessingIndication();
        clearTimeout(processing_timeout);
    };

    tree.sidebarSelectNode = selectNode;

    browser.runtime.onMessage.addListener(internalMessages);
    browser.runtime.onMessageExternal.addListener(externalMessages);

    try {
        await loadShelves(true, true);
    }
    catch (e) {
        console.error(e);

        confirm("{Error}", "Scrapyard has encountered a critical error.<br>Show diagnostic page?")
            .then(() => {
                localStorage.setItem("scrapyard-diagnostics-error",
                    JSON.stringify({origin: "Sidebar initialization", name: e.name, message: e.message, stack: e.stack}));
                openPage("options.html#diagnostics");
            });

        return;
    }

    if (settings.pending_announcement()) {
        $("#btnAnnouncement").css("display", "inline-block");
    }

    if (settings.display_random_bookmark())
        displayRandomBookmark();
};

function startProcessingIndication() {
    $("#shelf-menu-button").attr("src", "icons/grid.svg");
}

function stopProcessingIndication() {
    $("#shelf-menu-button").attr("src", "icons/menu.svg");
}

async function loadShelves(synchronize = true, clearSelection = false) {
    let shelf_list = $("#shelfList");

    try {
        let shelves = await backend.listShelves();

        shelf_list.html(`
        <option class="option-builtin" value="${TODO_SHELF_ID}">${TODO_SHELF_NAME}</option>
        <option class="option-builtin" value="${DONE_SHELF_ID}">${DONE_SHELF_NAME}</option>
        <option class="option-builtin divide" value="${EVERYTHING_SHELF_ID}">${formatShelfName(EVERYTHING)}</option>`);

        if (settings.cloud_enabled())
            shelf_list.append(`<option class=\"option-builtin\"
                                       value=\"${CLOUD_SHELF_ID}\">${formatShelfName(CLOUD_SHELF_NAME)}</option>`);

        let cloud_shelf = shelves.find(s => s.id === CLOUD_SHELF_ID);
        if (cloud_shelf)
            shelves.splice(shelves.indexOf(cloud_shelf), 1);

        if (settings.show_firefox_bookmarks())
            shelf_list.append(`<option class=\"option-builtin\"
                                       value=\"${FIREFOX_SHELF_ID}\">${formatShelfName(FIREFOX_SHELF_NAME)}</option>`);

        let firefox_shelf = shelves.find(s => s.id === FIREFOX_SHELF_ID);
        if (firefox_shelf)
            shelves.splice(shelves.indexOf(firefox_shelf), 1);

        shelves.sort((a, b) => a.name.localeCompare(b.name));

        let default_shelf = shelves.find(s => s.name.toLowerCase() === DEFAULT_SHELF_NAME);
        shelves.splice(shelves.indexOf(default_shelf), 1);
        default_shelf.name = formatShelfName(default_shelf.name);
        shelves = [default_shelf, ...shelves];

        for (let shelf of shelves) {
            let option = $("<option></option>").appendTo(shelf_list).html(shelf.name).attr("value", shelf.id);

            if (shelf.name.toLowerCase() === DEFAULT_SHELF_NAME)
                option.addClass("option-builtin");
        }

        let last_shelf_id = settings.last_shelf() || DEFAULT_SHELF_ID;

        if (last_shelf_id === "null")
            last_shelf_id = 1;

        let last_shelf = $(`#shelfList option[value="${last_shelf_id}"]`);
        last_shelf = last_shelf && last_shelf.length? last_shelf: $(`#shelfList option[value="1"]`);
        shelf_list.val(parseInt(last_shelf.val()));

        styleBuiltinShelf();
        shelf_list.selectric('refresh');
        return switchShelf(shelf_list.val(), synchronize, clearSelection);
    }
    catch (e) {
        console.error(e);
        shelf_list.val(DEFAULT_SHELF_ID);
        shelf_list.selectric('refresh');
        return switchShelf(DEFAULT_SHELF_ID, synchronize, clearSelection);
    }
}

async function switchShelf(shelf_id, synchronize = true, clearSelection = false) {

    if (settings.last_shelf() != shelf_id)
        tree.clearIconCache();

    let path = $(`#shelfList option[value="${shelf_id}"]`).text();
    path = isSpecialShelf(path)? path.toLocaleLowerCase(): path;

    await settings.load();
    settings.last_shelf(shelf_id);

    if (shelf_id == EVERYTHING_SHELF_ID)
        $("#shelf-menu-sort").show();
    else
        $("#shelf-menu-sort").hide();

    context.shelfName = path;

    if (canSearch())
        return performSearch();
    else {
        if (shelf_id == TODO_SHELF_ID) {
            const nodes = await backend.listTODO();
            tree.list(nodes, TODO_SHELF_NAME, true);
        }
        else if (shelf_id == DONE_SHELF_ID) {
            const nodes = await backend.listDONE();
            tree.list(nodes, DONE_SHELF_NAME, true);
        }
        else if (shelf_id == EVERYTHING_SHELF_ID) {
            const nodes = await backend.listShelfNodes(EVERYTHING);
            tree.update(nodes, true, clearSelection);
            if (synchronize && settings.cloud_enabled()) {
                send.reconcileCloudBookmarkDb({verbose: true});
            }
        }
        else if (shelf_id == CLOUD_SHELF_ID) {
            const nodes = await backend.listShelfNodes(path);
            tree.update(nodes, false, clearSelection);
            if (synchronize && settings.cloud_enabled()) {
                send.reconcileCloudBookmarkDb({verbose: true});
            }
        }
        else if (shelf_id == FIREFOX_SHELF_ID) {
            const nodes = await backend.listShelfNodes(path);
            nodes.splice(nodes.indexOf(nodes.find(n => n.id == FIREFOX_SHELF_ID)), 1);

            for (let node of nodes) {
                if (node.parent_id == FIREFOX_SHELF_ID) {
                    node.type = NODE_TYPE_SHELF;
                    node.parent_id = null;
                }
            }
            tree.update(nodes, false, clearSelection);

        }
        else if (path) {
            const nodes = await backend.listShelfNodes(path);
            tree.update(nodes, false, clearSelection);
        }
    }
}

document.addEventListener('contextmenu', function (event) {
    if ($(".dlg-cover:visible").length && event.target.localName !== "input")
        event.preventDefault();
});

function getCurrentShelf() {
    let selectedOption = $(`#shelfList option[value='${$("#shelfList").val()}']`);
    return {
        id: parseInt(selectedOption.val()),
        name: selectedOption.text(),
        option: selectedOption
    };
}

function canSearch() {
    return context.isInputValid($("#search-input").val());
}

async function performSearch() {
    let input = $("#search-input").val();

    if (context.isInputValid(input) && !context.isInSearch) {
        context.inSearch();
    }
    else if (!context.isInputValid(input) && context.isInSearch) {
        const {id} = getCurrentShelf();
        context.outOfSearch();
        switchShelf(id, false);
    }

    if (context.isInputValid(input))
        return context.search(input)
            .then(nodes => {
                tree.list(nodes);
            });
}

function performImport(file, file_name, file_ext) {

    startProcessingIndication();

    return send.importFile({file: file, file_name: file_name, file_ext: file_ext})
        .then(() => {
            stopProcessingIndication();

            if (file_name.toLocaleLowerCase() === EVERYTHING) {
                settings.last_shelf(EVERYTHING_SHELF_ID);

                loadShelves();
            }
            else
                backend.queryShelf(file_name).then(shelf => {

                    settings.last_shelf(shelf.id);

                    loadShelves().then(() => {
                        tree.openRoot();
                    });
                });
        }).catch(e => {
            console.error(e);
            stopProcessingIndication();
            showNotification({message: "The import has failed: " + e.message});
        });
}

function performExport() {
    let {id: shelf_id, name: shelf} = getCurrentShelf();

    if (shelf === FIREFOX_SHELF_NAME) {
        showNotification({message: "Please use Firefox builtin tools to export browser bookmarks."});
        return;
    }

    let nodes = tree.getExportedNodes(shelf_id);
    let uuid = nodes[0].uuid;
    nodes.shift(); // shelf

    startProcessingIndication();

    return send.exportFile({nodes: nodes.map(n => ({id: n.id, level: n.level})), shelf: shelf, uuid: uuid})
        .then(() => {
            stopProcessingIndication();
        }).catch(e => {
            console.log(e.message);
            stopProcessingIndication();
            if (!e.message?.includes("Download canceled"))
                showNotification({message: "The export has failed: " + e.message});
        });
}

function selectNode(node) {
    $("#search-input").val("");
    $("#search-input-clear").hide();

    backend.computePath(node.id).then(path => {
        settings.last_shelf(path[0].id);
        loadShelves(false)
            .then(() => {
                tree.selectNode(node.id);
            });
    });
}

function styleBuiltinShelf() {
    let {name} = getCurrentShelf();

    if (isSpecialShelf(name))
        $("div.selectric span.label").addClass("option-builtin");
    else
        $("div.selectric span.label").removeClass("option-builtin");
}

async function getRandomBookmark() {
    const ids = await backend.getNodeIds();

    if (!ids?.length)
        return null;

    let ctr = 20;
    do {
        const id = Math.floor(Math.random() * (ids.length - 1));
        const node = await backend.getNode(ids[id]);

        if (isEndpoint(node))
            return node;

        ctr -= 1;
    } while (ctr > 0);

    return null;
}

async function displayRandomBookmark() {
    let bookmark = randomBookmark = await getRandomBookmark();

    if (bookmark) {
        let html = `<i id="random-bookmark-icon"></i><p id="random-bookmark-link">${bookmark.name}</p>`;
        $("#footer-content").html(html);

        let icon = bookmark.icon? `url("${bookmark.icon}")`: "var(--themed-globe-icon)";

        if (bookmark.type === NODE_TYPE_ARCHIVE)
            $("#random-bookmark-link").css("font-style", "italic");

        if (bookmark.type === NODE_TYPE_NOTES) {
            icon = "var(--themed-notes-icon)";
            $("#random-bookmark-link").prop('title', `${bookmark.name}`);
        }
        else {
            $("#random-bookmark-link").prop('title', `${bookmark.name}\x0A${bookmark.uri}`);
        }

        if (bookmark.stored_icon) {
            icon = `url("${await backend.fetchIcon(bookmark.id)}")`;
        }
        else if (bookmark.icon) {
            let image = new Image();
            image.onerror = e => $("#random-bookmark-icon").css("background-image", "var(--themed-globe-icon)");
            image.src = bookmark.icon;
        }

        $("#random-bookmark-icon").css("background-image", icon);

        $("#footer").css("display", "grid");

        $("#random-bookmark-link").click(e => {
            send.browseNode({node: bookmark});
        });

        randomBookmarkTimeout = setTimeout(displayRandomBookmark, 60000 * 5);
    }
}

function internalMessages(message, sender, sendResponse) {
    if (message.type === "START_PROCESSING_INDICATION") {
        startProcessingIndication();
    }
    else if (message.type === "STOP_PROCESSING_INDICATION") {
        stopProcessingIndication();
    }
    else if (message.type === "BEFORE_BOOKMARK_ADDED") {
        const node = message.node;
        const select = settings.switch_to_new_bookmark();

        return backend._ensureUnique(node.parent_id, node.name).then(name => {
            node.name = name;
            tree.createTentativeNode(node);

            if (select) {
                return backend.computePath(node.parent_id).then(path => {
                    if (settings.last_shelf() == path[0].id) {
                        tree.selectNode(node.id);
                    }
                    else {
                        settings.last_shelf(path[0].id);
                        return loadShelves(false).then(() => {
                            tree.createTentativeNode(node, select);
                            tree.selectNode(node.id);
                        });
                    }
                });
            }
        });
    }
    else if (message.type === "BOOKMARK_ADDED") {
        if (settings.switch_to_new_bookmark())
            tree.updateTentativeNode(message.node);
    }
    else if (message.type === "BOOKMARK_CREATED") {
        if (settings.switch_to_new_bookmark())
            selectNode(message.node);
    }
    else if (message.type === "SELECT_NODE") {
        selectNode(message.node);
    }
    else if (message.type === "NOTES_CHANGED") {
        tree.setNotesState(message.node_id, !message.removed);
    }
    else if (message.type === "NODES_UPDATED") {
        let last_shelf = settings.last_shelf();
        switchShelf(last_shelf, false);
    }
    else if (message.type === "NODES_READY") {
        let last_shelf = settings.last_shelf();

        if (last_shelf == EVERYTHING_SHELF_ID || last_shelf == message.shelf.id) {
            loadShelves(false);
        }
    }
    else if (message.type === "NODES_IMPORTED") {
        settings.last_shelf(message.shelf.id, () => {
            loadShelves(false)
                //.then(() => switchShelf(message.shelf.id, false))
                .then(() => setTimeout(() => tree.openRoot(), 50))
                .catch(e => console.error(e));
        });
    }
    else if (message.type === "EXTERNAL_NODES_READY"
        || message.type === "EXTERNAL_NODE_UPDATED"
        || message.type === "EXTERNAL_NODE_REMOVED") {
        let last_shelf = settings.last_shelf();

        if (last_shelf == EVERYTHING_SHELF_ID || last_shelf == FIREFOX_SHELF_ID || last_shelf == CLOUD_SHELF_ID) {
            settings.load(() => {
                loadShelves(false);
            });
        }
    }
    else if (message.type === "CLOUD_SYNC_START") {
        tree.setNodeIcon(CLOUD_SHELF_ID, "var(--themed-cloud-sync-icon)")
    }
    else if (message.type === "CLOUD_SYNC_END") {
        tree.setNodeIcon(CLOUD_SHELF_ID, "var(--themed-cloud-icon)")
    }
    else if (message.type === "SHELVES_CHANGED") {
        return settings.load().then(() => loadShelves(false));
    }
    else if (message.type === "SIDEBAR_THEME_CHANGED") {
        if (message.theme === "dark")
            setDarkUITheme();
        else
            removeDarkUITheme();
    }
    else if (message.type === "DISPLAY_RANDOM_BOOKMARK") {
        clearTimeout(randomBookmarkTimeout);
        if (message.display)
            displayRandomBookmark();
        else
            $("#footer").css("display", "none");
    }
    else if (message.type === "RELOAD_SIDEBAR") {
        const sidebarUrl =  browser.runtime.getURL(`/sidebar.html#shelf-list-height-${message.height}`);
        browser.sidebarAction.setPanel({panel: sidebarUrl});
    }
}

function externalMessages(message, sender, sendResponse) {

    sender.ishell = ishellBackend.isIShell(sender.id);

    switch (message.type) {
        case "SCRAPYARD_SWITCH_SHELF":
            if (!sender.ishell)
                throw new Error();

            if (message.name) {
                let external_path = backend.expandPath(message.name);
                let [shelf, ...path] = external_path.split("/");

                backend.queryShelf(shelf).then(shelfNode => {
                    if (shelfNode) {
                        backend.getGroupByPath(external_path).then(group => {
                            shelfList.val(shelfNode.id);
                            shelfList.selectric("refresh");
                            switchShelf(shelfNode.id).then(() => {
                                tree.selectNode(group.id, true);
                            });
                        });
                    } else {
                        if (!isSpecialShelf(shelf)) {
                            backend.createGroup(null, shelf, NODE_TYPE_SHELF).then(shelfNode => {
                                if (shelfNode) {
                                    backend.getGroupByPath(external_path).then(group => {
                                        settings.last_shelf(shelfNode.id);
                                        loadShelves().then(() => {
                                            tree.selectNode(group.id, true);
                                        });
                                    });
                                }
                            });
                        } else {
                            showNotification({message: "Can not create shelf with this name."});
                        }
                    }
                });
            }
            break;
    }
}

console.log("==> sidebar.js loaded");
