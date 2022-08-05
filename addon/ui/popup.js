import {DEFAULT_SHELF_NAME, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "../storage.js";
import {askCSRPermission, getActiveTab} from "../utils_browser.js";
import {selectricRefresh, simpleSelectric} from "./shelf_list.js";
import {systemInitialization} from "../bookmarks_init.js";
import {getFaviconFromTab} from "../favicon.js";
import {Query} from "../storage_query.js";
import {BookmarkTree} from "./tree.js";
import {send} from "../proxy.js";
import {toggleSidebarWindow} from "../utils_sidebar.js";
import {isSpecialPage} from "../bookmarking.js";

let tree;
let bookmarkFolderSelect;
let folderHistory;
let crawlerMode;

$(init);

async function init() {
    await systemInitialization;

    const nodes = await Query.allGroups();
    tree = new BookmarkTree("#treeview", true);
    bookmarkFolderSelect = simpleSelectric("#bookmark-folder");
    folderHistory = loadFolderHistory(nodes);

    $("#bookmark-tags").focus();
    initBookmarkFolderSelect(bookmarkFolderSelect, folderHistory);
    tree.update(nodes);

    await saveActiveTabProperties();

    $("#new-folder").on("click", createNewFolder);
    $("#crawler-check").on("click", switchCrawlerMode);
    $("#treeview").on("select_node.jstree", onTreeFolderSelected);
    $("#sidebar-toggle").on("click", toggleSidebar);
    $("#create-bookmark").on("click", async () => await addBookmark(NODE_TYPE_BOOKMARK));
    $("#create-archive").on("click", async e => await addBookmark(NODE_TYPE_ARCHIVE));
    bookmarkFolderSelect.on("change", () => tree.selectNode(bookmarkFolderSelect.val(), false, true));
}

function loadFolderHistory(nodes) {
    let folderHistory = localStorage.getItem("popup-folder-history");

    if (folderHistory && folderHistory !== "null")
        folderHistory = JSON.parse(folderHistory).filter(h => nodes.some(n => n.id == h.id));
    else if (!folderHistory || folderHistory === "null")
        folderHistory = [];

    return folderHistory;
}

function saveFolderHistory(nodeId, text, history) {
    if (nodeId) {
        let folderHistory = history.slice(0);
        let existing = folderHistory.find(h => h.id == nodeId);

        if (existing)
            folderHistory.splice(folderHistory.indexOf(existing), 1);

        folderHistory = [{id: nodeId, text: text}, ...folderHistory].slice(0, 10);
        localStorage.setItem("popup-folder-history", JSON.stringify(folderHistory));
    }
}

function initBookmarkFolderSelect(bookmarkFolderSelect, folderHistory) {
    bookmarkFolderSelect.empty();

    if (folderHistory?.length)
        for (let item of folderHistory)
            bookmarkFolderSelect.append(`<option class='folder-label' value='${item.id}'>${item.text}</option>`);
    else
        bookmarkFolderSelect.append(`<option class='folder-label' value='1'>${DEFAULT_SHELF_NAME}</option>`);

    selectricRefresh(bookmarkFolderSelect);
}

async function saveActiveTabProperties() {
    const activeTab = await getActiveTab();

    if (activeTab) {
        $("#bookmark-name").val(activeTab.title);
        $("#bookmark-url").val(activeTab.url);

        let favicon;
        if (!isSpecialPage(activeTab.url))
             favicon = await getFaviconFromTab(activeTab);

        if (favicon)
            $("#bookmark-icon").val(favicon);
    }
}

function onTreeFolderSelected(e, {node: jnode}) {
    let existing = $(`#bookmark-folder option[value='${jnode.id}']`);

    if (!existing.length) {
        $("#bookmark-folder option[data-tentative='true']").remove();
        bookmarkFolderSelect.prepend(`<option  class='folder-label' data-tentative='true' selected
                                                    value='${jnode.id}'>${jnode.text}</option>`)
        selectricRefresh(bookmarkFolderSelect)
    }

    bookmarkFolderSelect.val(jnode.id);
    selectricRefresh(bookmarkFolderSelect)
}

async function createNewFolder() {
    const group = await tree.createNewGroupUnderSelection("$new_node$");

    if (group) {
        let newOption = $(`#bookmark-folder option[value='$new_node$']`);
        newOption.text(group.name);
        newOption.val(group.id);
        bookmarkFolderSelect.val(group.id);
        selectricRefresh(bookmarkFolderSelect)
    }
}

function switchCrawlerMode(e) {
    if (e.target.src.endsWith("mode-page.svg")) {
        e.target.src = "../icons/mode-site.svg";
        $("#create-archive").val("Archive Site");
        crawlerMode = true;
    }
    else {
        e.target.src = "../icons/mode-page.svg"
        $("#create-archive").val("Archive");
        crawlerMode = false;
    }
}

async function addBookmark(nodeType) {
    let parentJNode = tree.adjustBookmarkingTarget($("#bookmark-folder").val());
    saveFolderHistory(parentJNode.id, parentJNode.text, folderHistory);

    const payload = {
        type: nodeType,
        name: $("#bookmark-name").val(),
        uri:  $("#bookmark-url").val(),
        tags: $("#bookmark-tags").val(),
        icon: $("#bookmark-icon").val(),
        parent_id: parseInt(parentJNode.id),
        __crawl: crawlerMode
    };

    if (nodeType === NODE_TYPE_ARCHIVE) {
        if (await askCSRPermission())
            await send.createArchive({node: payload});
    }
    else
        await send.createBookmark({node: payload});

    window.close();
}

function toggleSidebar() {
    if (browser.sidebarAction)
        browser.sidebarAction.toggle();
    else
        toggleSidebarWindow();
}

console.log("==> popup.js loaded");
