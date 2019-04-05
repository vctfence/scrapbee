import {backend} from "./backend.js"

import {
    ENDPOINT_TYPES,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    NODE_TYPE_SEPARATOR,
    TODO_STATE_CANCELLED,
    TODO_STATE_DONE,
    TODO_STATE_POSTPONED,
    TODO_STATE_TODO,
    TODO_STATE_WAITING,
    EVERYTHING, TODO_NAMES, TODO_NAME
} from "./db.js"

import {showDlg, alert, confirm} from "./dialog.js"

export const TREE_STATE_PREFIX = "tree-state-";

class BookmarkTree {
    constructor(element, inline=false) {
        this._element = element;
        this._inline = inline;

        let plugins = ["wholerow", "types", "state"];

        if (!inline) {
            plugins = plugins.concat(["contextmenu", "dnd"]);
        }

        $(element).jstree({
            plugins: plugins,
            core: {
                worker: false,
                animation: 0,
                multiple: !inline,
                check_callback: BookmarkTree.checkOperation,
                themes: {
                    name: "default",
                    dots: false,
                    icons: true,
                },
            },
            contextmenu: {
                show_at_node: false,
                items: (node) => {return this.contextMenu(node)}
            },
            types: {
                "#": {
                    "valid_children": [NODE_TYPE_SHELF]
                },
                [NODE_TYPE_BOOKMARK]: {
                    "valid_children": []
                },
                [NODE_TYPE_ARCHIVE]: {
                    "valid_children": []
                },
                [NODE_TYPE_SEPARATOR]: {
                    "valid_children": []
                }
            },
            state: {
                key: inline? TREE_STATE_PREFIX + EVERYTHING: undefined
            }
        }).on("move_node.jstree", BookmarkTree.moveNode);

        this._jstree = $(element).jstree(true);

        $(document).on("click", ".jstree-anchor", (e) => {
            if (e.button === undefined || e.button === 0 || e.button === 1) {
                e.preventDefault();

                let element = e.target;
                while (element && !$(element).hasClass("jstree-anchor")) {
                    element = element.parentNode;
                }

                let clickable = element.getAttribute("data-clickable");
                let id = element.getAttribute("data-id");

                if (clickable && !e.ctrlKey) {
                    let node = this.data.find(n => n.id == id);
                    if (node) {
                        if (node.type === NODE_TYPE_BOOKMARK) {

                            let url = node.uri;
                            if (url) {
                                if (url.indexOf("://") < 0)
                                    url = "http://" + url;
                            }

                            browser.tabs.create({
                                "url": url
                            })
                        }
                        else if (node.type === NODE_TYPE_ARCHIVE) {
                            browser.runtime.sendMessage({type: "BROWSE_ARCHIVE", node: node});
                        }
                    }
                }
                return false;
            }
        })
    }

    traverse(root, visitor) {
        let _tree = this._jstree;
        function doTraverse(root) {
            visitor(root);
            if (root.children)
                for (let id of root.children) {
                    let node = _tree.get_node(id);
                    doTraverse(node);
                }
        }

        doTraverse(root);
    }

    // static _todoColor(todo_state) {
    //     switch (todo_state) {
    //         case TODO_STATE_TODO:
    //             return "#fc6dac";
    //         case TODO_STATE_WAITING:
    //             return"#ff8a00";
    //         case TODO_STATE_POSTPONED:
    //             return "#00b7ee";
    //         case TODO_STATE_CANCELLED:
    //             return "#ff4d26";
    //         case TODO_STATE_DONE:
    //             return "#00b60e";
    //     }
    //     return "";
    // }

    static _styleTODO(node) {
        if (node.todo_state)
            return " todo-state-" + (node._overdue
                ? "overdue"
                : TODO_NAMES[node.todo_state].toLowerCase());

        return "";
    }

    static _formatTODO(node) {
        let text = "<div><span class='todo-path'>";

        for (let i = 0; i < node._path.length; ++i) {
            text += node._path[i];

            if (i !== node._path.length - 1)
                text += " &#187; "
        }

        if (node.todo_date)
            text += " | " + "<span class='" + BookmarkTree._styleTODO(node) + "'>" + node.todo_date + "</span>";

        if (node.details)
            text += " | " + "<span class='todo-details'>" + node.details + "</span>";

        text += "</span><br/>";
        text += "<span class='todo-text'>" + node.name + "</span></div>";

        return text;
    }

    static toJsTreeNode(n) {
        n.text = n.name;

        n.parent = n.parent_id;
        if (!n.parent)
            n.parent = "#";

        if (n.type == NODE_TYPE_SHELF) {
            n.icon = "/icons/shelf.svg";
            n.li_attr = {
                "class": "scrapyard-shelf",
            }
        }
        else if (n.type == NODE_TYPE_GROUP) {
            n.icon = "/icons/group.svg";
            n.li_attr = {
                "class": "scrapyard-group",
            }
        }
        else if (n.type == NODE_TYPE_SEPARATOR) {
            n.text = "─".repeat(40);
            n.a_attr = {
                "class": "separator-node"
            };
        }
        else if (n.type != NODE_TYPE_SHELF) {
            let uri = "";
            if (n.uri)
                uri = false //n.uri.length > 60
                    ? "\x0A" + n.uri.substring(0, 60) + "..."
                    : ("\x0A" + n.uri);

            n.li_attr = {
                "class": "show_tooltip",
                "title": `${n.text}${uri}`
            };

            if (n.type == NODE_TYPE_ARCHIVE)
                n.li_attr.class += " archive-node";

            n.a_attr = {
                "class": "",
                "data-id": n.id,
                "data-clickable": "true"
            };

            if (n.todo_state) {
                n.a_attr.class += BookmarkTree._styleTODO(n);

                if (n._extended_todo) {
                    n.li_attr.class += " extended-todo";
                    n.text = BookmarkTree._formatTODO(n);
                }
            }

            if (!n.icon)
                n.icon = "/icons/homepage.png";
        }

        n.data = {};
        n.data.uuid = n.uuid;

        return n;
    }

    set data(nodes) {
        this._jstree.settings.core.data = nodes;
    }

    get data() {
        return this._jstree.settings.core.data
    }

    get stateKey() {
        return this._jstree.settings.state.key;
    }

    set stateKey(key) {
        this._jstree.settings.state.key = key;
    }

    get selected() {
        return this._jstree.get_node(this._jstree.get_selected())
    }

    update(nodes, everything = false) {
        nodes.forEach(BookmarkTree.toJsTreeNode);
        this.data = nodes;

        let state;

        if (this._inline || everything) {
            this._everything = true;
            this._jstree.settings.state.key = TREE_STATE_PREFIX + EVERYTHING;
            state = JSON.parse(localStorage.getItem(TREE_STATE_PREFIX + EVERYTHING));
        }
        else {
            this._everything = false;
            let shelves = this.data.filter(n => n.type == NODE_TYPE_SHELF);
            this._jstree.settings.state.key = TREE_STATE_PREFIX + shelves[0].name;
            state = JSON.parse(localStorage.getItem(TREE_STATE_PREFIX + shelves[0].name));
        }

        this._jstree.refresh(true, () => state? state.state: null);
    }

    list(nodes, state_key) {
        if (state_key)
            this.stateKey = TREE_STATE_PREFIX + state_key;

        nodes.forEach(BookmarkTree.toJsTreeNode);
        nodes.forEach(n => n.parent = "#");

        this.data = nodes;
        this._jstree.refresh(true);
    }

    renameRoot(name) {
        let root_node = this._jstree.get_node(this.data.find(n => n.type == NODE_TYPE_SHELF));
        this._jstree.rename_node(root_node, name);
    }

    openRoot() {
        let root_node = this._jstree.get_node(this.data.find(n => n.type == NODE_TYPE_SHELF));
        this._jstree.open_node(root_node);
        this._jstree.deselect_all(true);
    }

    static checkOperation(operation, node, parent, position, more) {
        // disable dnd copy
        if (operation === "copy_node") {
            return false;
        } else if (operation === "move_node") {
        }
        return true;
    }

    static moveNode(_, data) {
        let tree = $(this).jstree(true);
        let parent = tree.get_node(data.parent);

        if (data.parent != data.old_parent) {
            let node = tree.get_node(data.node);

            backend.moveNodes([node.original.id], parent.original.id).then(new_nodes => {
                //console.log("Nodes moved: "  + node.original.uuid);
                BookmarkTree.reorderNodes(tree, parent);
            });
        }
        else {
            BookmarkTree.reorderNodes(tree, parent);
        }
    }

    static reorderNodes(tree, parent) {
        let siblings = parent.children.map(c => tree.get_node(c));

        let positions = [];
        for (let i = 0; i < siblings.length; ++i) {
            let node = {};
            node.id = siblings[i].original.id;
            node.pos = i + 1;
            positions.push(node);
        }

        backend.reorderNodes(positions);
    }

    /* context menu listener */
    contextMenu(ctx_node) { // TODO: i18n
        let tree = this._jstree;
        let selected_nodes = tree.get_selected(true) || [];
        let multiselect = selected_nodes && selected_nodes.length > 1;
        let all_nodes = tree.settings.core.data;
        let ctx_node_data = ctx_node.original;

        function setTODOState(state) {
            let selected_ids = selected_nodes.map(n => n.original.type === NODE_TYPE_GROUP
                                                            || n.original.type === NODE_TYPE_SHELF
                                                        ? n.children
                                                        : n.original.id);
            let todo_states = [];
            let marked_nodes = selected_ids.flat().map(id => tree.get_node(id));

            selected_ids = marked_nodes.filter(n => ENDPOINT_TYPES.some(t => t == n.original.type))
                .map(n => parseInt(n.id));

            selected_ids.forEach(n => todo_states.push({id: n, todo_state: state}));

            backend.setTODOState(todo_states).then(() => {
                selected_ids.forEach(id => {

                    let node = tree.get_node(id);
                    node.original.todo_state = state;
                    node.a_attr.class = node.a_attr.class.replace(/todo-state-[a-zA-Z]+/g, "");
                    node.a_attr.class += BookmarkTree._styleTODO(node.original);
                    tree.redraw_node(node, true, false, true);
                });
            });
        }

        let items = {
            openItem: {
                label: "Open",
                action: function () {
                    for (let n of selected_nodes) {
                        switch (n.original.type) {
                            case NODE_TYPE_BOOKMARK:
                                browser.tabs.create({
                                    "url": n.original.uri
                                });
                                break;
                            case NODE_TYPE_ARCHIVE:
                                browser.runtime.sendMessage({type: "BROWSE_ARCHIVE", node: ctx_node_data});
                                break;
                        }
                    }
                }
            },
            openAllItem: {
                label: "Open All",
                action: function () {
                    let children = all_nodes.filter(n => ctx_node.children.some(id => id == n.id));
                    children.forEach(c =>  browser.tabs.create({
                        "url": c.uri
                    }))
                }
            },
            sortItem: {
                label: "Sort by Name",
                action: function () {
                    let children = ctx_node.children.map(c => tree.get_node(c));
                    children.sort((a, b) => a.text.localeCompare(b.text));
                    ctx_node.children = children.map(c => c.id);

                    tree.redraw_node(ctx_node, true, false, true);
                    BookmarkTree.reorderNodes(tree, ctx_node);
                }
            },
            openOriginalItem: {
                label: "Open Original URL",
                action: function () {
                    browser.tabs.create({
                        "url": ctx_node_data.uri
                    });
                }
            },
            copyLinkItem: {
                label: "Copy Link",
                action: function () {
                    navigator.clipboard.writeText(ctx_node_data.uri);
                }
            },
            newFolderItem: {
                label: "New Folder",
                action: function () {
                    // TODO: i18n
                    showDlg("prompt", {caption: "Create Folder", label: "Name"}).then(dlg_data => {
                        let name;
                        if (name = dlg_data.title) {
                              if (/*!isBuiltinShelf(shelf)*/true) {
                                backend.createGroup(ctx_node_data.id, name).then(group => {
                                    if (group) {
                                        BookmarkTree.toJsTreeNode(group);
                                        tree.deselect_all(true);
                                        tree.select_node(tree.create_node(ctx_node, group));
                                        BookmarkTree.reorderNodes(tree, ctx_node);
                                    }
                                });
                            }
                            else {
                                alert("{Error}", `Can not create folder in a built-in shelf.`);
                                return;
                            }
                        }
                    });
                }
            },
            newSeparatorItem: {
                label: "New Separator",
                action: function () {
                    let parent = tree.get_node(ctx_node.parent);
                    console.log(parent);
                    backend.addSeparator(parent.original.id).then(separator => {
                            let position = $.inArray(ctx_node.id, parent.children);
                            tree.create_node(parent, BookmarkTree.toJsTreeNode(separator), position + 1);
                            BookmarkTree.reorderNodes(tree, parent);
                        });
                }
            },
            cutItem: {
                separator_before: true,
                label: "Cut",
                action: function () {
                    tree.cut(selected_nodes);
                }
            },
            copyItem: {
                label: "Copy",
                action: function () {
                    tree.copy(selected_nodes);
                }
            },
            pasteItem: {
                label: "Paste",
                _disabled: !(tree.can_paste() && (ctx_node_data.type == NODE_TYPE_GROUP
                    || ctx_node_data.type == NODE_TYPE_SHELF)),
                action: function () {
                    let buffer = tree.get_buffer();
                    let selection =  Array.isArray(buffer.node)
                        ? buffer.node.map(n => n.original.id)
                        : [buffer.node.original.id];

                    (buffer.mode == "copy_node"
                        ? backend.copyNodes(selection, ctx_node_data.id)
                        : backend.moveNodes(selection, ctx_node_data.id))
                        .then(new_nodes => {
                            switch (buffer.mode) {
                                case "copy_node":
                                    break;
                                case "move_node":
                                    for (let s of selection)
                                        tree.delete_node(s);
                                    break;
                            }

                            for (let n of new_nodes) {
                                let parent = tree.get_node(n.parent_id);
                                tree.create_node(parent, BookmarkTree.toJsTreeNode(n), "last");
                            }

                            BookmarkTree.reorderNodes(tree, ctx_node);

                            tree.clear_buffer();
                        });
                }
            },
            todoItem: {
                separator_before: true,
                label: "TODO",
                submenu: {
                    todoItem: {
                        label: "TODO",
                        icon: "icons/todo.svg",
                        action: function () {
                            setTODOState(TODO_STATE_TODO);
                        }
                    },
                    waitingItem: {
                        label: "WAITING",
                        icon: "icons/waiting.svg",
                        action: function () {
                            setTODOState(TODO_STATE_WAITING);
                        }
                    },
                    postponedItem: {
                        label: "POSTPONED",
                        icon: "icons/postponed.svg",
                        action: function () {
                            setTODOState(TODO_STATE_POSTPONED);
                        }
                    },
                    cancelledItem: {
                        label: "CANCELLED",
                        icon: "icons/cancelled.svg",
                        action: function () {
                            setTODOState(TODO_STATE_CANCELLED);
                        }
                    },
                    doneItem: {
                        label: "DONE",
                        icon: "icons/done.svg",
                        action: function () {
                            setTODOState(TODO_STATE_DONE);
                        }
                    },
                    clearItem: {
                        separator_before: true,
                        label: "Clear",
                        action: function () {
                            setTODOState(null);
                        }
                    }
                }
            },
            deleteItem: {
                separator_before: true,
                label: "Delete",
                action: () => {
                    if (ctx_node_data.type === NODE_TYPE_SHELF) {
                        if (this.onDeleteShelf)
                            this.onDeleteShelf(ctx_node_data);
                    }
                    else {
                        confirm("{Warning}", "{ConfirmDeleteItem}").then(() => {
                            let selected_ids = selected_nodes.map(n => n.original.id);

                            backend.deleteNodes(selected_ids).then(() => {
                                tree.delete_node(selected_nodes);
                            });
                        });
                    }
                }
            },
            propertiesItem: {
                separator_before: true,
                label: "Properties...",
                action: function () {
                    switch (ctx_node.original.type) {
                        case NODE_TYPE_BOOKMARK:
                        case NODE_TYPE_ARCHIVE:
                            showDlg("properties", ctx_node_data).then(data => {
                                let original_node_data = all_nodes.find(n => n.id == ctx_node.id);

                                backend.updateBookmark(Object.assign(original_node_data, data)).then(() => {
                                    if (!ctx_node_data._extended_todo) {
                                        tree.rename_node(ctx_node, ctx_node_data.name);
                                    }
                                    else {
                                        tree.rename_node(ctx_node, BookmarkTree._formatTODO(ctx_node_data));
                                    }
                                    tree.redraw_node(ctx_node, true, false, true);
                                });
                            });
                            break;
                    }
                }
            },
            renameItem: {
                label: "Rename",
                action: () => {
                    switch (ctx_node.original.type) {
                        case NODE_TYPE_SHELF:
                            if (this.onRenameShelf)
                                this.onRenameShelf(ctx_node_data);
                            break;
                        case NODE_TYPE_GROUP:
                            tree.edit(ctx_node, null, (node, success, cancelled) => {
                                if (success && !cancelled)
                                    backend.renameGroup(ctx_node_data.id, node.text).then(group => {
                                        ctx_node_data.name = ctx_node_data.text = group.name;
                                        tree.rename_node(ctx_node, group.name);
                                    });
                            });
                            break;
                    }
                }
            }
        };

        if (ctx_node.original.type !== NODE_TYPE_SHELF) {
            switch (ctx_node.original.type) {
                case NODE_TYPE_GROUP:
                    delete items.openItem;
                    delete items.openOriginalItem;
                    delete items.propertiesItem;
                    delete items.copyLinkItem;
                    break;
                case NODE_TYPE_BOOKMARK:
                    delete items.openOriginalItem;
                case NODE_TYPE_ARCHIVE:
                    delete items.openAllItem;
                    delete items.sortItem;
                    delete items.newFolderItem;
                    delete items.renameItem;
                    break;
            }
        }
        else {
            for (let k in items)
                if (!["newFolderItem", "renameItem", "pasteItem", "sortItem", "todoItem", "deleteItem"].find(s => s === k))
                    delete items[k];
        }

        if (ctx_node.original.type === NODE_TYPE_SEPARATOR) {
            for (let k in items)
                if (!["deleteItem"].find(s => s === k))
                    delete items[k];
        }

        if (ctx_node.original._extended_todo) {
            delete items.newSeparatorItem;
        }

        if (multiselect) {
            items["sortItem"] && (items["sortItem"]._disabled = true);
            items["renameItem"] && (items["renameItem"]._disabled = true);
            items["openAllItem"] && (items["openAllItem"]._disabled = true);
            items["newFolderItem"] && (items["newFolderItem"]._disabled = true);
            items["propertiesItem"] && (items["propertiesItem"]._disabled = true);
            items["openOriginalItem"] && (items["openOriginalItem"]._disabled = true);
        }

        return items;
    }

}


export {BookmarkTree};
