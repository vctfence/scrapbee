import {BookmarkTree} from "./tree.js";
import {backend} from "./backend.js";
import {DEFAULT_SHELF_NAME, NODE_TYPE_GROUP, NODE_TYPE_SHELF} from "./db.js";

let tree;

function withCurrTab(fn) {
    return browser.tabs.query({currentWindow: true, active: true}).then(function (tabs) {
        fn.apply(null, [tabs[0]]);
    });
}

window.onload = function () {
    tree = new BookmarkTree("#treeview", true);
    backend.listNodes({
        types: [NODE_TYPE_SHELF, NODE_TYPE_GROUP],
        order: "custom"
    }).then(nodes => {
        tree.update(nodes);
    });

    withCurrTab((tab) => {
        $("#bookmark-name").val(tab.title);
    });

    $("#bookmark-tags").focus();

    $("#treeview").on("select_node.jstree", (e, {node}) => {
        let existing = $(`#bookmark-folder option[value='${node.id}']`);
        if (!existing.length) {
            $(`#bookmark-folder option:selected`).removeAttr("selected");
            $("#bookmark-folder option[data-tentative='true']").remove();
            $("#bookmark-folder").prepend(`<option data-tentative='true' selected value='${node.id}'>${node.text}</option>`)
        }
        else {
            $(`#bookmark-folder option:selected`).removeAttr("selected");
            existing.attr("selected", true);
        }
    });

    let folder_history = localStorage.getItem("popup-folder-history");

    if (folder_history != null && folder_history !== "null") {
        folder_history = JSON.parse(folder_history);

        for (let item of folder_history) {
            $("#bookmark-folder").append(`<option value='${item.id}'>${item.text}</option>`)
        }
    }
    else {
        folder_history = [];
    }

    $("#bookmark-folder").on("change", (e) => {
        let id = $("#bookmark-folder option:selected").val();
        tree._inst.deselect_all(true);
        tree._inst.select_node(id);
        document.getElementById(id).scrollIntoView();
    });

    $("#new-folder").on("click", () => {
        let selected_node = tree._inst.get_node(tree._inst.get_selected());
        let node = tree._inst.create_node(selected_node, {text: "New Folder",
            type: NODE_TYPE_GROUP, icon: "icons/group.svg"});
        tree._inst.deselect_node(selected_node);
        tree._inst.select_node(node);
        tree._inst.edit(node, null, (node, success, cancelled) => {
            if (cancelled) {
                tree._inst.delete_node(node);
            }
            else {
                backend.createGroup(selected_node.original.id, node.text).then(group => {
                    if (group) {
                        node.original.id = group.id;
                        node.original.uuid = group.uuid;
                        BookmarkTree.toJsTreeNode(group);
                        BookmarkTree.reorderNodes(tree, selected_node);
                    }
                });
            }
        });
    });

    $("#create-bookmark").on("click", (e) => {
        let selected = $(`#bookmark-folder option:selected`);

        let existing = folder_history.find(h => h.id == selected.val());
        if (existing)
            folder_history.splice(folder_history.indexOf(existing), 1);

        folder_history = [{id: selected.val(), text: selected.text()}].concat(folder_history).slice(0, 11);
        localStorage.setItem("popup-folder-history", JSON.stringify(folder_history));
    });
};
