import {send, receive, receiveExternal} from "../proxy.js";
import {settings} from "../settings.js"
import {backend, formatShelfName} from "../backend.js"
import {ishellBackend} from "../backend_ishell.js"
import {BookmarkTree} from "./tree.js"
import {showDlg, confirm} from "./dialog.js"

import {
    SearchContext,
    SEARCH_MODE_TITLE, SEARCH_MODE_TAGS, SEARCH_MODE_CONTENT,
    SEARCH_MODE_NOTES, SEARCH_MODE_COMMENTS, SEARCH_MODE_DATE
} from "../search.js";

import {pathToNameExt} from "../utils.js";
import {
    CLOUD_SHELF_ID, CLOUD_SHELF_NAME,
    DEFAULT_SHELF_ID, DEFAULT_SHELF_NAME,
    DONE_SHELF_NAME, DONE_SHELF_ID,
    EVERYTHING, EVERYTHING_SHELF_ID,
    FIREFOX_SHELF_ID, FIREFOX_SHELF_NAME,
    NODE_TYPE_SHELF, TODO_SHELF_NAME, TODO_SHELF_ID,
    NODE_TYPE_ARCHIVE, NODE_TYPE_NOTES,
    isSpecialShelf, isEndpoint, DEFAULT_POSITION
} from "../storage_constants.js";
import {openPage, showNotification} from "../utils_browser.js";

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

    $("#shelf-menu-create").click(createShelf);
    $("#shelf-menu-rename").click(renameShelf);
    $("#shelf-menu-delete").click(deleteShelf);
    $("#shelf-menu-sort").click(sortShelves);

    $("#shelf-menu-import").click(() => $("#file-picker").click());
    $("#file-picker").change(importShelf);

    $("#shelf-menu-export").click(() => performExport());

    $("#search-mode-switch").click(() => {
        $("#shelf-menu").hide();
        $("#search-mode-menu").toggle();
    });

    $("#shelf-menu-search-title").click(() => {
        $("#search-mode-switch").prop("src", "/icons/bookmark.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_TITLE, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-tags").click(() => {
        $("#search-mode-switch").prop("src", "/icons/tags.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_TAGS, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-content").click(() => {
        $("#search-mode-switch").prop("src", "/icons/content-web.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_CONTENT, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-notes").click(() => {
        $("#search-mode-switch").prop("src", "/icons/content-notes.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_NOTES, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-comments").click(() => {
        $("#search-mode-switch").prop("src", "/icons/content-comments.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_COMMENTS, getCurrentShelf().name);
        performSearch();
    });

    $("#shelf-menu-search-date").click(() => {
        $("#search-mode-switch").prop("src", "/icons/calendar.svg");
        $("#search-input").attr("placeholder", "examples: 2021-02-24, before 2021-02-24, after 2021-02-24")
        context.setMode(SEARCH_MODE_DATE, getCurrentShelf().name);
        performSearch();
    });

    let filterInputTimeout;
    $("#search-input").on("input", e => {
        clearTimeout(filterInputTimeout);

        if (e.target.value) {
            $("#search-input-clear").show();
            filterInputTimeout = setTimeout(() => performSearch(), INPUT_TIMEOUT);
        }
        else {
            filterInputTimeout = null;
            performSearch();
            $("#search-input-clear").hide();
        }
    });

    $("#search-input-clear").click(e => {
        $("#search-input").val("");
        $("#search-input-clear").hide();
        $("#search-input").trigger("input");
    });

    $(document).on("click", e => {
        if (!e.target.matches("#shelf-menu-button")
            && !e.target.matches("#prop-dlg-containers-icon")
            && !e.target.matches("#search-mode-switch"))
            $(".simple-menu").hide();
    });

    $(document).on('contextmenu', e => {
        if ($(".dlg-cover:visible").length && e.target.localName !== "input")
            e.preventDefault();
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
        openPage(settings.pending_announcement())
        settings.pending_announcement(null);
        $("#btnAnnouncement").hide();
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

    tree.startProcessingIndication = startProcessingIndication;
    tree.stopProcessingIndication = stopProcessingIndication;

    tree.sidebarSelectNode = selectNode;

    receive.startListener();
    receiveExternal.startListener();

    try {
        await loadShelves(true, true);
    }
    catch (e) {
        console.error(e);

        if (await confirm("{Error}", "Scrapyard has encountered a critical error.<br>Show diagnostic page?")) {
            localStorage.setItem("scrapyard-diagnostics-error",
                JSON.stringify({origin: "Sidebar initialization", name: e.name, message: e.message, stack: e.stack}));
            openPage("options.html#diagnostics");
        }

        return;
    }

    if (settings.pending_announcement()) {
        $("#btnAnnouncement").css("display", "inline-block");
    }

    if (settings.display_random_bookmark())
        displayRandomBookmark();
};

let processingTimeout;
function startProcessingIndication(no_wait) {
    const startIndication = () => $("#shelf-menu-button").attr("src", "/icons/grid.svg");
    if (no_wait) {
        startIndication();
        clearTimeout(processingTimeout);
    }
    else
        processingTimeout = setTimeout(startIndication, 1000);
}

function stopProcessingIndication() {
    $("#shelf-menu-button").attr("src", "/icons/menu.svg");
    clearTimeout(processingTimeout);
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
            tree.openRoot();
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
            tree.openRoot();
        }
    }
}

async function createShelf() {
    const options = await showDlg("prompt", {caption: "Create Shelf", label: "Name"});

    if (options?.title) {
        if (!isSpecialShelf(options.title)) {
            const shelf = await backend.createGroup(null, options.title, NODE_TYPE_SHELF);
            if (shelf) {
                settings.last_shelf(shelf.id);
                loadShelves();
            }
        }
        else
            showNotification({message: "Can not create shelf with this name."})
    }
}

async function renameShelf() {
    let {id, name, option} = getCurrentShelf();

    if (name && !isSpecialShelf(name)) {
        const options = await showDlg("prompt", {caption: "Rename", label: "Name", title: name});
        let newName = options?.title;
        if (newName && !isSpecialShelf(newName)) {
            await backend.renameGroup(id, newName)

            option.text(newName);
            tree.renameRoot(newName);

            shelfList.selectric('refresh');
        }
    }
    else
        showNotification({message: "A built-in shelf could not be renamed."});
}

async function deleteShelf() {
    let {id, name} = getCurrentShelf();

    if (isSpecialShelf(name)) {
        showNotification({message: "A built-in shelf could not be deleted."})
        return;
    }

    const proceed = await confirm("{Warning}", "Do you really want to delete '" + name + "'?");

    if (proceed && name) {
        await send.deleteNodes({node_ids: id})
        $(`#shelfList option[value="${id}"]`).remove();

        shelfList.val(DEFAULT_SHELF_ID);
        shelfList.selectric('refresh');
        switchShelf(1);
    }
}

async function sortShelves() {
    let nodes = await backend.queryShelf();
    let special = nodes.filter(n => isSpecialShelf(n.name)).sort((a, b) => a.id - b.id);
    let regular = nodes.filter(n => !isSpecialShelf(n.name)).sort((a, b) => a.name.localeCompare(b.name));
    let sorted = [...special, ...regular];

    let positions = [];
    for (let i = 0; i < sorted.length; ++i)
        positions.push({id: sorted[i].id, pos: i});

    await send.reorderNodes({positions: positions});
    loadShelves(false);
}

async function importShelf(e) {
    if (e.target.files.length > 0) {
        let {name, ext} = pathToNameExt($("#file-picker").val());
        let lname = name.toLocaleLowerCase();

        if (lname === DEFAULT_SHELF_NAME || lname === EVERYTHING || !isSpecialShelf(lname)) {
            let existingOption = $(`#shelfList option`).filter(function(i, e) {
                return e.textContent.toLocaleLowerCase() === lname;
            });

            if (existingOption.length) {
                if (await confirm("{Warning}", "This will replace '" + name + "'.")) {
                    await performImport(e.target.files[0], name, ext);
                    $("#file-picker").val("");
                }
            }
            else {
                await performImport(e.target.files[0], name, ext);
                $("#file-picker").val("");
            }
        }
        else
            showNotification({message: `Cannot replace '${name}'.`});
    }
}

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
        return context.search(input).then(nodes => tree.list(nodes));
}

async function performImport(file, file_name, file_ext) {
    startProcessingIndication();

    try {
        await send.importFile({file: file, file_name: file_name, file_ext: file_ext});
        stopProcessingIndication();

        if (file_name.toLocaleLowerCase() === EVERYTHING) {
            settings.last_shelf(EVERYTHING_SHELF_ID);
            loadShelves();
        }
        else {
            const shelf = await backend.queryShelf(file_name);
            settings.last_shelf(shelf.id);
            await loadShelves()
            tree.openRoot();
        }
    }
    catch (e) {
        console.error(e);
        stopProcessingIndication();
        showNotification({message: "The import has failed: " + e.message});
    }
}

async function performExport() {
    let {id: shelf_id, name: shelf} = getCurrentShelf();

    if (shelf === FIREFOX_SHELF_NAME) {
        showNotification({message: "Please use Firefox builtin tools to export browser bookmarks."});
        return;
    }

    let nodes = tree.getExportedNodes(shelf_id);
    let uuid = nodes[0].uuid;
    nodes.shift(); // shelf

    startProcessingIndication();

    try {
        await send.exportFile({nodes: nodes.map(n => ({id: n.id, level: n.level})), shelf: shelf, uuid: uuid});
        stopProcessingIndication();
    }
    catch (e) {
        console.log(e.message);
        stopProcessingIndication();
        if (!e.message?.includes("Download canceled"))
            showNotification({message: "The export has failed: " + e.message});
    }
}

async function selectNode(node) {
    $("#search-input").val("");
    $("#search-input-clear").hide();

    const path = await backend.computePath(node.id)
    settings.last_shelf(path[0].id);
    await loadShelves(false);
    tree.selectNode(node.id);
}

function sidebarRefresh() {
    let last_shelf = settings.last_shelf();
    switchShelf(last_shelf, false);
}

function sidebarRefreshExternal() {
    let last_shelf = settings.last_shelf();

    if (last_shelf == EVERYTHING_SHELF_ID || last_shelf == FIREFOX_SHELF_ID || last_shelf == CLOUD_SHELF_ID)
        settings.load().then(() => loadShelves(false));
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

receive.startProcessingIndication = message => {
    startProcessingIndication(message.no_wait);
};

receive.stopProcessingIndication = message => {
    stopProcessingIndication();
};

receive.beforeBookmarkAdded = async message => {
    const node = message.node;
    const select = settings.switch_to_new_bookmark();

    const name = await backend._ensureUnique(node.parent_id, node.name);
    node.name = name;
    tree.createTentativeNode(node);

    if (select) {
        const path = await backend.computePath(node.parent_id);
        if (settings.last_shelf() == path[0].id) {
            tree.selectNode(node.id);
        }
        else {
            settings.last_shelf(path[0].id);
            await loadShelves(false)
            tree.createTentativeNode(node, select);
            tree.selectNode(node.id);
        }
    }
};

receive.bookmarkAdded = message => {
    if (settings.switch_to_new_bookmark())
        tree.updateTentativeNode(message.node);
};

receive.bookmarkCreated = message => {
    if (settings.switch_to_new_bookmark())
        selectNode(message.node);
};

receive.selectNode = message => {
    selectNode(message.node);
};

receive.notesChanged = message => {
    tree.setNotesState(message.node_id, !message.removed);
};

receive.nodesUpdated = sidebarRefresh;

receive.nodesReady = message => {
    let last_shelf = settings.last_shelf();

    if (last_shelf == EVERYTHING_SHELF_ID || last_shelf == message.shelf.id)
        loadShelves(false);
};

receive.nodesImported = message => {
    const shelfId = message.shelf? message.shelf.id: EVERYTHING_SHELF_ID;

    settings.last_shelf(shelfId, async () => {
        try {
            await loadShelves(false);
            if (shelfId !== EVERYTHING_SHELF_ID)
                setTimeout(() => tree.openRoot(), 50);
        } catch (e) {
            console.error(e);
        }
    });
};

receive.externalNodesReady = sidebarRefreshExternal;
receive.externalNodeUpdated = sidebarRefreshExternal;
receive.externalNodeRemoved = sidebarRefreshExternal;

receive.cloudSyncStart = message => {
    tree.setNodeIcon(CLOUD_SHELF_ID, "var(--themed-cloud-sync-icon)");
};

receive.cloudSyncEnd = message => {
    tree.setNodeIcon(CLOUD_SHELF_ID, "var(--themed-cloud-icon)");
};

receive.shelvesChanged = message => {
    return settings.load().then(() => loadShelves(false));
};

receive.sidebarThemeChanged = message => {
    if (message.theme === "dark")
        setDarkUITheme();
    else
        removeDarkUITheme();
};

receive.displayRandomBookmark = message => {
    clearTimeout(randomBookmarkTimeout);
    if (message.display)
        displayRandomBookmark();
    else
        $("#footer").css("display", "none");
};

receive.reloadSidebar = message => {
    const sidebarUrl = browser.runtime.getURL(`/ui/sidebar.html#shelf-list-height-${message.height}`);
    browser.sidebarAction.setPanel({panel: sidebarUrl});
};


receiveExternal.scrapyardSwitchShelf = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    if (message.name) {
        let external_path = backend.expandPath(message.name);
        let [shelf, ...path] = external_path.split("/");

        const shelfNode = await backend.queryShelf(shelf);

        if (shelfNode) {
            const group = await backend.getGroupByPath(external_path);
            shelfList.val(shelfNode.id);
            shelfList.selectric("refresh");
            await switchShelf(shelfNode.id);
            tree.selectNode(group.id, true);
        }
        else {
            if (!isSpecialShelf(shelf)) {
                const shelfNode = await backend.createGroup(null, shelf, NODE_TYPE_SHELF);
                if (shelfNode) {
                    let group = await backend.getGroupByPath(external_path);

                    settings.last_shelf(shelfNode.id);
                    await loadShelves();

                    tree.selectNode(group.id, true);
                }
            }
            else
                showNotification({message: "Can not create shelf with this name."});
        }
    }
};

async function switchAfterCopy(message, external_path, group, topNodes) {
    if (message.action === "switching") {
        const [shelf, ...path] = external_path.split("/");
        const shelfNode = await backend.queryShelf(shelf);

        settings.last_shelf(shelfNode.id);
        await loadShelves();

        tree.openNode(group.id)
        tree.selectNode(topNodes);
    }
    else
        await switchShelf(settings.last_shelf());
}

receiveExternal.scrapyardCopyAt = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let external_path = backend.expandPath(message.path);
    let selection = tree.getSelectedNodes();

    if (selection.some(n => n.type === NODE_TYPE_SHELF)) {
        showNotification("Can not copy shelves.")
    }
    else {
        selection.sort((a, b) => a.pos - b.pos);
        selection = selection.map(n => n.id);

        const group = await backend.getGroupByPath(external_path);
        let newNodes = await send.copyNodes({node_ids: selection, dest_id: group.id, move_last: true});
        let topNodes = newNodes.filter(n => selection.some(id => id === n.old_id)).map(n => n.id);

        await switchAfterCopy(message, external_path, group, topNodes);
    }
};

receiveExternal.scrapyardMoveAt = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let external_path = backend.expandPath(message.path);
    let selection = tree.getSelectedNodes();
    if (selection.some(n => n.type === NODE_TYPE_SHELF)) {
        showNotification("Can not move shelves.")
    }
    else {
        selection.sort((a, b) => a.pos - b.pos);
        selection = selection.map(n => n.id);

        const group = await backend.getGroupByPath(external_path);
        await send.moveNodes({node_ids: selection, dest_id: group.id, move_last: true});
        await switchAfterCopy(message, external_path, group, selection);
    }
};

console.log("==> sidebar.js loaded");
