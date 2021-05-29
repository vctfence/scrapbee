import {backend} from "../backend.js";
import {BookmarkTree} from "./tree.js";
import {DEFAULT_SHELF_NAME, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "../storage.js";
import {getFaviconFromTab, testFavicon} from "../favicon.js";
import {send} from "../proxy.js";

let tree;

function withCurrentTab(fn) {
    return browser.tabs.query({currentWindow: true, active: true}).then(function (tabs) {
        fn.apply(null, [tabs[0]]);
    });
}

function saveHistory(nodeId, text, history) {
    if (nodeId) {
        let folderHistory = history.slice(0);
        let existing = folderHistory.find(h => h.id == nodeId);

        if (existing)
            folderHistory.splice(folderHistory.indexOf(existing), 1);

        folderHistory = [{id: nodeId, text: text}, ...folderHistory].slice(0, 10);
        localStorage.setItem("popup-folder-history", JSON.stringify(folderHistory));
    }
}

window.onload = async function () {
    await backend;

    let folderHistory;

    tree = new BookmarkTree("#treeview", true);

    $("#bookmark-folder").selectric({inheritOriginalWidth: true});

    backend.listGroups().then(nodes => {
        $("#bookmark-folder").html("");

        folderHistory = localStorage.getItem("popup-folder-history");

        if (folderHistory != null && folderHistory !== "null") {
            folderHistory = JSON.parse(folderHistory).filter(h => nodes.some(n => n.id == h.id));

            if (folderHistory && folderHistory.length) {
                for (let item of folderHistory) {
                    $("#bookmark-folder").append(`<option class='folder-label' value='${item.id}'>${item.text}</option>`)
                }
            }
        }

        if (!folderHistory || folderHistory === "null" || !folderHistory.length) {
            folderHistory = [];
            $("#bookmark-folder").append(`<option class='folder-label' value='1'>${DEFAULT_SHELF_NAME}</option>`)
        }

        $("#bookmark-folder").selectric("refresh");

        tree.update(nodes);
    });


    withCurrentTab(async tab => {
        $("#bookmark-name").val(tab.title);
        $("#bookmark-url").val(tab.url);

        let favicon = await getFaviconFromTab(tab);

        if (favicon)
            $("#bookmark-icon").val(favicon);
    });

    $("#bookmark-tags").focus();

    $("#treeview").on("select_node.jstree", (e, {node: jnode}) => {
        let existing = $(`#bookmark-folder option[value='${jnode.id}']`);

        if (!existing.length) {
            $("#bookmark-folder option[data-tentative='true']").remove();
            $("#bookmark-folder").prepend(`<option  class='folder-label' data-tentative='true' selected
                                                    value='${jnode.id}'>${jnode.text}</option>`)
            $("#bookmark-folder").selectric("refresh");
        }

        $("#bookmark-folder").val(jnode.id);
        $("#bookmark-folder").selectric("refresh");
    });

    $("#bookmark-folder").on("change", (e) => {
        let id = $("#bookmark-folder").val();
        tree.selectNode(id, false, true);
    });

    $("#new-folder").on("click", () => {
        tree.createNewGroupUnderSelection("$new_node$").then(group => {
            if (group) {
                let newOption = $(`#bookmark-folder option[value='$new_node$']`);
                newOption.text(group.name);
                newOption.val(group.id);
                $("#bookmark-folder").val(group.id);
                $("#bookmark-folder").selectric("refresh");
            }
        })
    });

    async function addBookmark(nodeType) {
        let parentJNode = tree.adjustBookmarkingTarget($("#bookmark-folder").val());
        saveHistory(parentJNode.id, parentJNode.text, folderHistory);

        const payload = {
            type: nodeType,
            name: $("#bookmark-name").val(),
            uri:  $("#bookmark-url").val(),
            tags: $("#bookmark-tags").val(),
            icon: $("#bookmark-icon").val(),
            parent_id: parseInt(parentJNode.id)
        };

        if (nodeType === NODE_TYPE_ARCHIVE)
            await send.createArchive({data: payload});
        else
            await send.createBookmark({data: payload});
    }

    $("#create-bookmark").on("click", async e => {
        await addBookmark(NODE_TYPE_BOOKMARK);
        window.close();
    });

    $("#create-archive").on("click", async e => {
        await addBookmark(NODE_TYPE_ARCHIVE);
        window.close();
    });
};

console.log("==> popup.js loaded");
