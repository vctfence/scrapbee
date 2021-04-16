import {backend} from "./backend.js";
import {settings} from "./settings.js"
import {BookmarkTree} from "./tree.js";
import {DEFAULT_SHELF_NAME, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "./storage_constants.js";
import {getFaviconFromTab, testFavicon} from "./utils.js";

let tree;

function withCurrentTab(fn) {
    return browser.tabs.query({currentWindow: true, active: true}).then(function (tabs) {
        fn.apply(null, [tabs[0]]);
    });
}

function saveHistory(nodeId, text, history) {
    if (nodeId) {
        let folder_history = history.slice(0);
        let existing = folder_history.find(h => h.id == nodeId);

        if (existing)
            folder_history.splice(folder_history.indexOf(existing), 1);

        folder_history = [{id: nodeId, text: text}, ...folder_history].slice(0, 10);
        localStorage.setItem("popup-folder-history", JSON.stringify(folder_history));
    }
}

window.onload = function () {

    let folder_history;

    tree = new BookmarkTree("#treeview", true);

    $("#bookmark-folder").selectric({inheritOriginalWidth: true});

    backend.listGroups().then(nodes => {
        $("#bookmark-folder").html("");

        folder_history = localStorage.getItem("popup-folder-history");

        if (folder_history != null && folder_history !== "null") {
            folder_history = JSON.parse(folder_history).filter(h => nodes.some(n => n.id == h.id));

            if (folder_history && folder_history.length) {
                for (let item of folder_history) {
                    $("#bookmark-folder").append(`<option class='folder-label' value='${item.id}'>${item.text}</option>`)
                }
            }
        }

        if (!folder_history || folder_history === "null" || !folder_history.length) {
            folder_history = [];
            $("#bookmark-folder").append(`<option class='folder-label' value='1'>${DEFAULT_SHELF_NAME}</option>`)
        }

        $("#bookmark-folder").selectric("refresh");

        settings.load(() => {
            tree.update(nodes);
        });
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
            $("#bookmark-folder").prepend(`<option  class='folder-label'  data-tentative='true' selected value='${jnode.id}'>${jnode.text}</option>`)
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
                let new_option = $(`#bookmark-folder option[value='$new_node$']`);
                new_option.text(group.name);
                new_option.val(group.id);
                $("#bookmark-folder").val(group.id);
                $("#bookmark-folder").selectric("refresh");
            }
        })
    });

    function addBookmark(node_type) {
        let parent_jnode = tree.adjustBookmarkingTarget($("#bookmark-folder").val());
        saveHistory(parent_jnode.id, parent_jnode.text, folder_history);
        browser.runtime.sendMessage({type: node_type === NODE_TYPE_BOOKMARK
                                            ? "CREATE_BOOKMARK"
                                            : "CREATE_ARCHIVE",
                                     data: {
                                        name: $("#bookmark-name").val(),
                                        uri:  $("#bookmark-url").val(),
                                        tags: $("#bookmark-tags").val(),
                                        icon: $("#bookmark-icon").val(),
                                        parent_id: parseInt(parent_jnode.id)
                                    }});
    }

    $("#create-bookmark").on("click", (e) => {
        addBookmark(NODE_TYPE_BOOKMARK);
        window.close();
    });

    $("#create-archive").on("click", (e) => {
        addBookmark(NODE_TYPE_ARCHIVE);
        window.close();
    });
};

console.log("==> popup.js loaded");
