import {BookmarkTree} from "./tree.js";
import {backend} from "./backend.js";
import {DEFAULT_SHELF_NAME, NODE_TYPE_GROUP, NODE_TYPE_SHELF} from "./db.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "./db.js";

let tree;

function withCurrTab(fn) {
    return browser.tabs.query({currentWindow: true, active: true}).then(function (tabs) {
        fn.apply(null, [tabs[0]]);
    });
}

function saveHistory(node, history) {
    if (node) {
        let folder_history = history.slice(0);
        let existing = folder_history.find(h => h.id == node.original.id);

        if (existing)
            folder_history.splice(folder_history.indexOf(existing), 1);

        folder_history = [{id: node.original.id, text: node.text}, ...folder_history].slice(0, 10);
        localStorage.setItem("popup-folder-history", JSON.stringify(folder_history));
    }
}

window.onload = function () {

    let folder_history;

    tree = new BookmarkTree("#treeview", true);

    backend.listNodes({
        types: [NODE_TYPE_SHELF, NODE_TYPE_GROUP],
        order: "custom"
    }).then(nodes => {
        folder_history = localStorage.getItem("popup-folder-history");

        if (folder_history != null && folder_history !== "null") {
            folder_history = JSON.parse(folder_history).filter(h => nodes.some(n => n.id == h.id));

            if (folder_history && folder_history.length) {
                for (let item of folder_history) {
                    $("#bookmark-folder").append(`<option value='${item.id}'>${item.text}</option>`)
                }
            }
        }

        if (!folder_history || folder_history === "null" || !folder_history.length) {
            folder_history = [];
            $("#bookmark-folder").append(`<option value='1'>${DEFAULT_SHELF_NAME}</option>`)
        }

        tree.update(nodes);
    });


    withCurrTab((tab) => {
        $("#bookmark-name").val(tab.title);
        $("#bookmark-url").val(tab.url);

        browser.tabs.executeScript(tab.id, {
            code: `function extractIcon() {
                let iconElt = document.querySelector("head link[rel*='icon'], head link[rel*='shortcut']");
                console.log(iconElt.href);
                if (iconElt)
                    return iconElt.href;
            }
            extractIcon();
            `}).then(icon => {
                if (icon && icon.length && icon[0])
                    $("#bookmark-icon").val(icon[0]);
            }).catch(e => {
                console.log(e)
            });
    });

    $("#bookmark-tags").focus();

    $("#treeview").on("select_node.jstree", (e, {node}) => {
        let existing = $(`#bookmark-folder option[value='${node.original.id}']`);

        if (!existing.length) {
            $(`#bookmark-folder option:selected`).removeAttr("selected");
            $("#bookmark-folder option[data-tentative='true']").remove();
            $("#bookmark-folder").prepend(`<option data-tentative='true' selected value='${node.original.id}'>${node.text}</option>`)
        }
        else {
            $(`#bookmark-folder option:selected`).removeAttr("selected");
            existing.attr("selected", true);
        }
    });

    $("#bookmark-folder").on("change", (e) => {
        let id = $("#bookmark-folder").val();
        tree._jstree.deselect_all(true);
        tree._jstree.select_node(id);
        document.getElementById(id).scrollIntoView();
    });

    $("#new-folder").on("click", () => {
        let selected_node = tree.selected;
        let node = tree._jstree.create_node(selected_node, {text: "New Folder",
            type: NODE_TYPE_GROUP, icon: "icons/group.svg"});
        tree._jstree.deselect_node(selected_node);
        tree._jstree.select_node(node);
        tree._jstree.edit(node, null, (node, success, cancelled) => {
            if (cancelled) {
                tree._jstree.delete_node(node);
            }
            else {
                backend.createGroup(selected_node.original.id, node.text).then(group => {
                    if (group) {
                        node.original.id = group.id;
                        node.original.uuid = group.uuid;
                        BookmarkTree.toJsTreeNode(group);
                        BookmarkTree.reorderNodes(tree._jstree, selected_node);

                        let new_option = $("#bookmark-folder option:selected");
                        new_option.text(group.name);
                        new_option.val(node.id);
                    }
                });
            }
        });
    });

    function addBookmark(node_type) {
        let node = tree._jstree.get_node($("#bookmark-folder").val());

        saveHistory(node, folder_history);
        console.log($("#bookmark-icon").val());
        browser.runtime.sendMessage({type: node_type === NODE_TYPE_BOOKMARK
                                            ? "CREATE_BOOKMARK"
                                            : "CREATE_ARCHIVE",
                                     data: {
                                        name: $("#bookmark-name").val(),
                                        uri:  $("#bookmark-url").val(),
                                        tags: $("#bookmark-tags").val(),
                                        icon: $("#bookmark-icon").val(),
                                        parent_id: node.original.id
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