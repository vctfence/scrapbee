import {receive, receiveExternal, send, sendLocal} from "../proxy.js";
import {settings} from "../settings.js"
import {ishellBackend} from "../backend_ishell.js"
import {BookmarkTree} from "./tree.js"
import {confirm, showDlg} from "./dialog.js"
import {
    SEARCH_MODE_COMMENTS,
    SEARCH_MODE_CONTENT,
    SEARCH_MODE_DATE,
    SEARCH_MODE_FOLDER,
    SEARCH_MODE_NOTES,
    SEARCH_MODE_TAGS,
    SEARCH_MODE_TITLE, SEARCH_MODE_UNIVERSAL,
    SearchContext
} from "../search.js";
import {pathToNameExt} from "../utils.js";
import {
    byPosition,
    CLOUD_SHELF_ID,
    DEFAULT_SHELF_ID,
    DEFAULT_SHELF_NAME,
    DONE_SHELF_ID,
    DONE_SHELF_NAME,
    EVERYTHING,
    EVERYTHING_SHELF_ID,
    FIREFOX_SHELF_ID,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_NOTES,
    NODE_TYPE_SHELF,
    TODO_SHELF_ID,
    TODO_SHELF_NAME,
    isBuiltInShelf,
    isVirtualShelf,
    isEndpoint
} from "../storage.js";
import {openPage, showNotification} from "../utils_browser.js";
import {ShelfList} from "./shelf_list.js";
import {Query} from "../storage_query.js";
import {Path} from "../path.js";
import {Shelf} from "../bookmarks_shelf.js";
import {TODO} from "../bookmarks_todo.js";
import {Bookmark} from "../bookmarks_bookmark.js";
import {Group} from "../bookmarks_group.js";
import {Icon, Node} from "../storage_entities.js";
import {undoManager} from "../bookmarks_undo.js";
import {systemInitialization} from "../bookmarks_init.js";

const INPUT_TIMEOUT = 1000;

let tree;
let context;
let shelfList;

let randomBookmark;
let randomBookmarkTimeout;

window.addEventListener('DOMContentLoaded', () => {
    const shelfListPlaceholderDiv = $("#shelfList-placeholder");
    shelfListPlaceholderDiv.css("width", ShelfList.getStoredWidth("sidebar") || ShelfList.DEFAULT_WIDTH);
    shelfListPlaceholderDiv.show();
    $("#shelves-icon").show();
});

$(init);

async function init() {
    await systemInitialization;

    shelfList = new ShelfList("#shelfList", {
        maxHeight: settings.shelf_list_height() || settings.default.shelf_list_height,
        _prefix: "sidebar"
    });

    tree = new BookmarkTree("#treeview");
    context = new SearchContext(tree);

    shelfList.change(function () { switchShelf(this.value, true, true) });

    $("#btnLoad").on("click", () => loadShelves());
    $("#btnSync").on("click", () => performSync());
    $("#btnSearch").on("click", () => openPage("/ui/fulltext.html"));
    $("#btnSettings").on("click", () => openPage("/ui/options.html"));
    $("#btnHelp").on("click", () => openPage("/ui/options.html#help"));

    // in the case if settings are cleaned by user
    localStorage.setItem("sidebar-show-sync", settings.sync_enabled()? "show": "hide");

    $("#shelf-menu-button").click(async () => {
        $("#search-mode-menu").hide();

        if (await undoManager.canUndo())
            $("#shelf-menu-undo").show();
        else
            $("#shelf-menu-undo").hide();

        $("#shelf-menu").toggle();
    });

    $("#shelf-menu-create").click(createShelf);
    $("#shelf-menu-rename").click(renameShelf);
    $("#shelf-menu-delete").click(deleteShelf);
    $("#shelf-menu-sort").click(sortShelves);

    $("#shelf-menu-import").click(() => $("#file-picker").click());
    $("#file-picker").change(importShelf);

    $("#shelf-menu-export").click(() => performExport());

    $("#shelf-menu-undo").click(() => send.performUndo());
    $("#shelf-menu-abort").click(() => send.abortRequested());

    $("#search-mode-switch").click(() => {
        $("#shelf-menu").hide();
        $("#search-mode-menu").toggle();
    });

    $("#shelf-menu-search-universal").click(() => {
        $("#search-mode-switch").prop("src", "/icons/star.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_UNIVERSAL, shelfList.selectedShelfName);
        performSearch();
    });

    $("#shelf-menu-search-title").click(() => {
        $("#search-mode-switch").prop("src", "/icons/bookmark.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_TITLE, shelfList.selectedShelfName);
        performSearch();
    });

    $("#shelf-menu-search-folder").click(() => {
        $("#search-mode-switch").prop("src", "/icons/filter-folder.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_FOLDER, shelfList.selectedShelfName);
        performSearch();
    });

    $("#shelf-menu-search-tags").click(() => {
        $("#search-mode-switch").prop("src", "/icons/tags.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_TAGS, shelfList.selectedShelfName);
        performSearch();
    });

    $("#shelf-menu-search-content").click(() => {
        $("#search-mode-switch").prop("src", "/icons/content-web.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_CONTENT, shelfList.selectedShelfName);
        performSearch();
    });

    $("#shelf-menu-search-notes").click(() => {
        $("#search-mode-switch").prop("src", "/icons/content-notes.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_NOTES, shelfList.selectedShelfName);
        performSearch();
    });

    $("#shelf-menu-search-comments").click(() => {
        $("#search-mode-switch").prop("src", "/icons/content-comments.svg");
        $("#search-input").attr("placeholder", "");
        context.setMode(SEARCH_MODE_COMMENTS, shelfList.selectedShelfName);
        performSearch();
    });

    $("#shelf-menu-search-date").click(() => {
        $("#search-mode-switch").prop("src", "/icons/calendar.svg");
        $("#search-input").attr("placeholder", "examples: 2021-02-24, before 2021-02-24, after 2021-02-24")
        context.setMode(SEARCH_MODE_DATE, shelfList.selectedShelfName);
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

    $("#footer-close-btn").click(async e => {
        await settings.load();
        settings.display_random_bookmark(false);
        clearTimeout(randomBookmarkTimeout);
        $("#footer").hide();
    });

    $("#btnAnnouncement").click(e => {
        openPage(settings.pending_announcement())
        settings.pending_announcement(null);
        $("#btnAnnouncement").hide();
    })

    tree.onRenameShelf = node => shelfList.renameShelf(node.id, node.name);

    tree.onDeleteShelf = node_ids => {
        shelfList.removeShelves(node_ids);

        if (!tree._everything)
            switchShelf(DEFAULT_SHELF_ID);
    };

    tree.startProcessingIndication = startProcessingIndication;
    tree.stopProcessingIndication = stopProcessingIndication;

    tree.sidebarSelectNode = selectNode;

    receive.startListener();
    receiveExternal.startListener();

    loadSidebar();
}

window.onunload = async function() {
    if (settings.sync_enabled() && settings.sync_on_close_sidebar())
        send.performSync();
};

async function loadSidebar() {
    try {
        await shelfList.load();

        const initialShelf = getExternalShelf() || getLastShelf() || DEFAULT_SHELF_ID;
        await switchShelf(initialShelf, true, true);

        stopProcessingIndication();
    }
    catch (e) {
        console.error(e);

        stopProcessingIndication();

        if (await confirm("Error", "Scrapyard has encountered a critical error.<br>Show diagnostic page?")) {
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
}

let processingTimeout;
function startProcessingIndication(noWait) {
    const startIndication = () => $("#shelf-menu-button").attr("src", "/icons/grid.svg");
    if (noWait) {
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

function getLastShelf() {
    const lastShelf = localStorage.getItem("scrapyard-last-shelf");

    if (lastShelf)
        return parseInt(lastShelf);

    return DEFAULT_SHELF_ID;
}

function getExternalShelf() {
    const externalShelf = localStorage.getItem("sidebar-select-shelf");

    if (externalShelf) {
        localStorage.removeItem("sidebar-select-shelf");
        return parseInt(externalShelf);
    }
}

function setLastShelf(id) {
    localStorage.setItem("scrapyard-last-shelf", id);
}

async function loadShelves(selected, synchronize = true, clearSelection = false) {
    try {
        updateProgress(0);
        await shelfList.reload();
        const switchToId = selected || getLastShelf() || DEFAULT_SHELF_ID;
        return switchShelf(switchToId, synchronize, clearSelection);
    }
    catch (e) {
        console.error(e);
        return switchShelf(DEFAULT_SHELF_ID, synchronize, clearSelection);
    }
}

async function switchShelf(shelf_id, synchronize = true, clearSelection = false) {

    if (getLastShelf() != shelf_id)
        tree.clearIconCache();

    shelfList.selectShelf(shelf_id);
    let path = shelfList.selectedShelfName;
    path = isBuiltInShelf(path)? path.toLocaleLowerCase(): path;

    setLastShelf(shelf_id);

    if (shelf_id == EVERYTHING_SHELF_ID)
        $("#shelf-menu-sort").show();
    else
        $("#shelf-menu-sort").hide();

    context.shelfName = path;

    if (canSearch())
        return performSearch();
    else {
        if (shelf_id == TODO_SHELF_ID) {
            const nodes = await TODO.listTODO();
            tree.list(nodes, TODO_SHELF_NAME, true);
        }
        else if (shelf_id == DONE_SHELF_ID) {
            const nodes = await TODO.listDONE();
            tree.list(nodes, DONE_SHELF_NAME, true);
        }
        else if (shelf_id == EVERYTHING_SHELF_ID) {
            const nodes = await Shelf.listContent(EVERYTHING);
            tree.update(nodes, true, clearSelection);
            if (synchronize && settings.cloud_enabled()) {
                send.reconcileCloudBookmarkDb({verbose: true});
            }
        }
        else if (shelf_id == CLOUD_SHELF_ID) {
            const nodes = await Shelf.listContent(path);
            tree.update(nodes, false, clearSelection);
            if (synchronize && settings.cloud_enabled()) {
                send.reconcileCloudBookmarkDb({verbose: true});
            }
            tree.openRoot();
        }
        else if (shelf_id == FIREFOX_SHELF_ID) {
            const nodes = await Shelf.listContent(path);
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
            const nodes = await Shelf.listContent(path);
            tree.update(nodes, false, clearSelection);
            tree.openRoot();
        }
    }
}

async function createShelf() {
    const options = await showDlg("prompt", {caption: "Create Shelf", label: "Name:"});

    if (options?.title) {
        if (!isBuiltInShelf(options.title)) {
            const shelf = await send.createShelf({name: options.title});
            if (shelf)
                loadShelves(shelf.id);
        }
        else
            showNotification({message: "Can not create shelf with this name."})
    }
}

async function renameShelf() {
    let {id, name} = shelfList.getCurrentShelf();

    if (name && !isBuiltInShelf(name)) {
        const options = await showDlg("prompt", {caption: "Rename", label: "Name", title: name});
        let newName = options?.title;
        if (newName && !isBuiltInShelf(newName)) {
            await send.renameGroup({id, name: newName});
            tree.renameRoot(newName);
            shelfList.renameShelf(id, newName);
        }
    }
    else
        showNotification({message: "A built-in shelf could not be renamed."});
}


async function deleteShelf() {
    let {id, name} = shelfList.getCurrentShelf();

    if (isBuiltInShelf(name)) {
        showNotification({message: "A built-in shelf could not be deleted."})
        return;
    }

    const proceed = await confirm("Warning", "Do you really want to delete '" + name + "'?");

    if (proceed && name) {
        await send.softDeleteNodes({node_ids: id})
        shelfList.removeShelves(id);
        switchShelf(DEFAULT_SHELF_ID);
    }
}

async function sortShelves() {
    let nodes = await Query.allShelves();
    let builtIn = nodes.filter(n => isBuiltInShelf(n.name)).sort((a, b) => a.id - b.id);
    let regular = nodes.filter(n => !isBuiltInShelf(n.name)).sort((a, b) => a.name.localeCompare(b.name));
    let sorted = [...builtIn, ...regular];

    let positions = [];
    for (let i = 0; i < sorted.length; ++i)
        positions.push({id: sorted[i].id, pos: i});

    await send.reorderNodes({positions: positions});
    loadShelves(getLastShelf(), false);
}

async function importShelf(e) {
    if (e.target.files.length > 0) {
        let {name, ext} = pathToNameExt($("#file-picker").val());
        let lname = name.toLocaleLowerCase();

        if (lname === DEFAULT_SHELF_NAME || lname === EVERYTHING || !isBuiltInShelf(lname)) {
            if (shelfList.hasShelf(name)) {
                if (await confirm("Warning", "This will replace '" + name + "'.")) {
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

function canSearch() {
    return context.isInputValid($("#search-input").val());
}

async function performSearch() {
    let input = $("#search-input").val();

    if (context.isInputValid(input) && !context.isInSearch) {
        context.inSearch();
    }
    else if (!context.isInputValid(input) && context.isInSearch) {
        context.outOfSearch();
        switchShelf(shelfList.selectedShelfId, false);
    }

    if (context.isInputValid(input))
        return context.search(input).then(nodes => tree.list(nodes));
}

if (!_BACKGROUND_PAGE)
    import("../core_import.js");

async function performImport(file, file_name, file_ext) {
    startProcessingIndication(true);

    try {
        const sender = _BACKGROUND_PAGE? send: sendLocal;
        await sender.importFile({file: file, file_name: file_name, file_ext: file_ext});
        stopProcessingIndication();

        if (file_name.toLocaleLowerCase() === EVERYTHING)
            await loadShelves(EVERYTHING_SHELF_ID);
        else {
            const shelf = await Query.shelf(file_name);
            await loadShelves(shelf.id);
        }
    }
    catch (e) {
        console.error(e);
        stopProcessingIndication();
        showNotification({message: "The import has failed: " + e.message});
    }
}

async function performExport() {
    let {name: shelf, uuid} = shelfList.getCurrentShelf();

    startProcessingIndication(true);

    try {
        const sender = _BACKGROUND_PAGE? send: sendLocal;
        await sender.exportFile({shelf, uuid});
        stopProcessingIndication();
    }
    catch (e) {
        console.error(e);
        stopProcessingIndication();
        if (!e.message?.includes("Download canceled"))
            showNotification({message: "The export has failed: " + e.message});
    }
}

async function performSync(verbose = true) {
    if (getLastShelf() === CLOUD_SHELF_ID)
        await switchShelf(CLOUD_SHELF_ID);
    else {
        await settings.load();
        if (settings.sync_enabled())
            send.performSync();
        else if (verbose)
            showNotification("Synchronization is not configured.");
    }
}

async function selectNode(node, open, forceScroll) {
    $("#search-input").val("");
    $("#search-input-clear").hide();

    const path = await Path.compute(node)
    await loadShelves(path[0].id, false);
    tree.selectNode(node.id, open, forceScroll);
}

async function selectOrCreatePath(path) {
    if (path) {
        let normalized_path = Path.expand(path);
        let [shelf] = normalized_path.split("/");

        const shelfNode = await Query.shelf(shelf);

        if (shelfNode) {
            const group = await Group.getOrCreateByPath(normalized_path);
            await switchShelf(shelfNode.id);
            tree.selectNode(group.id, true);
        }
        else {
            if (isVirtualShelf(shelf)) {
                switch (shelf.toUpperCase()) {
                    case EVERYTHING.toUpperCase():
                        await switchShelf(EVERYTHING_SHELF_ID);
                        break;
                    case TODO_SHELF_NAME:
                        await switchShelf(TODO_SHELF_ID);
                        break;
                    case DONE_SHELF_NAME:
                        await switchShelf(DONE_SHELF_ID);
                        break;
                }
            }
            else {
                const shelfNode = await Shelf.add(shelf);
                if (shelfNode) {
                    let group = await Group.getOrCreateByPath(normalized_path);
                    await loadShelves(shelfNode.id);
                    tree.selectNode(group.id, true);
                }
            }
        }
    }
}

function sidebarRefresh() {
    switchShelf(getLastShelf(), false);
}

function sidebarRefreshExternal() {
    let last_shelf = getLastShelf();

    if (last_shelf === EVERYTHING_SHELF_ID || last_shelf === FIREFOX_SHELF_ID || last_shelf === CLOUD_SHELF_ID)
        settings.load().then(() => loadShelves(last_shelf, false));
}

async function getRandomBookmark() {
    const ids = await Query.allNodeIDs();

    if (!ids?.length)
        return null;

    let ctr = 20;
    do {
        const id = Math.floor(Math.random() * (ids.length - 1));
        const node = await Node.get(ids[id]);

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
            icon = `url("${await Icon.get(bookmark.id)}")`;
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
    startProcessingIndication(message.noWait);
};

receive.stopProcessingIndication = message => {
    stopProcessingIndication();
};

receive.beforeBookmarkAdded = async message => {
    const node = message.node;
    const select = settings.switch_to_new_bookmark();

    if (node.type === NODE_TYPE_ARCHIVE)
        startProcessingIndication(true);

    node.name = await Bookmark.ensureUniqueName(node.parent_id, node.name);
    tree.createTentativeNode(node);

    if (select) {
        const path = await Path.compute(node.parent_id);
        if (getLastShelf() == path[0].id)
            tree.selectNode(node.id);
        else {
            await loadShelves(path[0].id, false)
            tree.createTentativeNode(node, select);
            tree.selectNode(node.id);
        }
    }
};

receive.bookmarkCreationFailed = async message => {
    tree.removeTentativeNode(message.node);
};

receive.bookmarkAdded = message => {
    if (message.node.type === NODE_TYPE_ARCHIVE)
        stopProcessingIndication();

    if (settings.switch_to_new_bookmark())
        if (!tree.updateTentativeNode(message.node))
            selectNode(message.node);
};

receive.bookmarkCreated = message => {
    if (settings.switch_to_new_bookmark())
        selectNode(message.node);
};

receive.selectNode = message => {
    selectNode(message.node, message.open, message.forceScroll);
};

receive.selectPath = async (message, sender) => {
    await selectOrCreatePath(message.path);
};

receive.notesChanged = message => {
    tree.setNotesState(message.node_id, !message.removed);
};

receive.nodesUpdated = sidebarRefresh;

receive.nodesReady = message => {
    let last_shelf = getLastShelf();

    if (last_shelf == EVERYTHING_SHELF_ID || last_shelf == message.shelf.id)
        loadShelves(last_shelf, false);
};

receive.nodesImported = message => {
    const shelfId = message.shelf? message.shelf.id: EVERYTHING_SHELF_ID;

    return  loadShelves(shelfId, false);
};

receive.externalNodesReady = sidebarRefreshExternal;
receive.externalNodeUpdated = sidebarRefreshExternal;
receive.externalNodeRemoved = sidebarRefreshExternal;

receive.cloudSyncStart = message => {
    startProcessingIndication();
    tree.setNodeIcon(CLOUD_SHELF_ID, "var(--themed-cloud-sync-icon)");
};

receive.cloudSyncEnd = message => {
    tree.setNodeIcon(CLOUD_SHELF_ID, "var(--themed-cloud-icon)");
    stopProcessingIndication();
};

receive.shelvesChanged = message => {
    return settings.load().then(() => loadShelves(getLastShelf(), message.synchronize));
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

receive.syncStateChanged = message => {
    if (message.enabled) {
        $("#btnSync").css("display", "inline-block");
        localStorage.setItem("sidebar-show-sync", "show");
    }
    else {
        $("#btnSync").hide();
        localStorage.setItem("sidebar-show-sync", "hide");
    }
};

receive.toggleAbortMenu = message => {
    if (message.show)
        $("#shelf-menu-abort").show();
    else
        $("#shelf-menu-abort").hide();
};

receive.exportProgress = message => message.muteSidebar? null: updateProgress(message);
receive.importProgress = message => message.muteSidebar? null: updateProgress(message);
receive.syncProgress = message => updateProgress(message);
receive.cloudSyncProgress = message => updateProgress(message);
receive.fullTextSearchProgress = message => updateProgress(message);

function updateProgress(message) {
    const progressDiv = $("#sidebar-progress");
    if (message.progress) {
        if (message.finished) {
            setTimeout(() => progressDiv.css("width", "0"), 300);
        }
        else if (message.progress === 100) {
            progressDiv.css("width", message.progress + "%");
            setTimeout(() => progressDiv.css("width", "0"), 200);
        }
        else
            progressDiv.css("width", message.progress + "%");
    }
    else
        progressDiv.css("width", "0");
}

let browseNode;
if (!_BACKGROUND_PAGE) {
    const browseModule = await import("../browse.js");
    browseNode = browseModule.browseNode;
}

receive.browseNodeSidebar = message => {
    if (browseNode)
        browseNode(message.node, message);
};

receiveExternal.scrapyardSwitchShelfIshell = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    await selectOrCreatePath(message.name);
};

async function switchAfterCopy(message, external_path, group, topNodes) {
    if (message.action === "switching") {
        const [shelf, ...path] = external_path.split("/");
        const shelfNode = await Query.shelf(shelf);

        await loadShelves(shelfNode.id);

        tree.openNode(group.id)
        tree.selectNode(topNodes);
    }
    else
        await switchShelf(getLastShelf());
}

receiveExternal.scrapyardCopyAtIshell = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let external_path = Path.expand(message.path);
    let selection = tree.getSelectedNodes();

    if (selection.some(n => n.type === NODE_TYPE_SHELF)) {
        showNotification("Can not copy shelves.")
    }
    else {
        selection.sort(byPosition);
        selection = selection.map(n => n.id);

        const group = await Group.getOrCreateByPath(external_path);
        let newNodes = await send.copyNodes({node_ids: selection, dest_id: group.id, move_last: true});
        let topNodes = newNodes.filter(n => selection.some(id => id === n.old_id)).map(n => n.id);

        await switchAfterCopy(message, external_path, group, topNodes);
    }
};

receiveExternal.scrapyardMoveAtIshell = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let external_path = Path.expand(message.path);
    let selection = tree.getSelectedNodes();
    if (selection.some(n => n.type === NODE_TYPE_SHELF)) {
        showNotification("Can not move shelves.")
    }
    else {
        selection.sort(byPosition);
        selection = selection.map(n => n.id);

        const group = await Group.getOrCreateByPath(external_path);
        await send.moveNodes({node_ids: selection, dest_id: group.id, move_last: true});
        await switchAfterCopy(message, external_path, group, selection);
    }
};

console.log("==> sidebar.js loaded");
