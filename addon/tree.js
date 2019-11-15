import {backend, dropboxBackend} from "./backend.js"

import {
    ENDPOINT_TYPES,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    NODE_TYPE_SEPARATOR,
    NODE_TYPE_NOTES,
    TODO_STATE_CANCELLED,
    TODO_STATE_DONE,
    TODO_STATE_POSTPONED,
    TODO_STATE_TODO,
    TODO_STATE_WAITING,
    EVERYTHING,
    TODO_NAMES,
    TODO_NAME,
    FIREFOX_SHELF_NAME,
    FIREFOX_SHELF_ID,
    isSpecialShelf,
    isContainer,
    isEndpoint,
    FIREFOX_BOOKMARK_MENU,
    FIREFOX_BOOKMARK_UNFILED,
    FIREFOX_BOOKMARK_TOOLBAR,
    FIREFOX_BOOKMARK_MOBILE, RDF_EXTERNAL_NAME, CLOUD_EXTERNAL_NAME, CLOUD_SHELF_NAME
} from "./db.js"

import {showDlg, alert, confirm} from "./dialog.js"
import {settings} from "./settings.js";
import {GetPocket} from "./lib/pocket.js";
import {showNotification} from "./utils.js";

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
                [NODE_TYPE_SHELF]: {
                    "valid_children": [NODE_TYPE_GROUP, ...ENDPOINT_TYPES, NODE_TYPE_SEPARATOR]
                },
                [NODE_TYPE_GROUP]: {
                    "valid_children": [NODE_TYPE_GROUP, ...ENDPOINT_TYPES, NODE_TYPE_SEPARATOR]
                },
                [NODE_TYPE_BOOKMARK]: {
                    "valid_children": []
                },
                [NODE_TYPE_ARCHIVE]: {
                    "valid_children": []
                },
                [NODE_TYPE_NOTES]: {
                    "valid_children": []
                },
                [NODE_TYPE_SEPARATOR]: {
                    "valid_children": []
                }
            },
            state: {
                key: inline? TREE_STATE_PREFIX + EVERYTHING: undefined
            },
            dnd: {
                inside_pos: "last"
            }
        }).on("move_node.jstree", BookmarkTree.moveNode.bind(this));

        this._jstree = $(element).jstree(true);

        $(document).on("mousedown", ".jstree-node", e => this.handleMouseClick(e));
        $(document).on("click", ".jstree-anchor", e => this.handleMouseClick(e));
        // $(document).on("auxclick", ".jstree-anchor", e => e.preventDefault());
    }

    handleMouseClick(e) {
        if (e.type === "click" && e.target._mousedown_fired) {
            e.target._mousedown_fired = false;
            return;
        }

        if (e.button === undefined || e.button === 0 || e.button === 1) {
            e.preventDefault();

            if (e.type === "mousedown")
                e.target._mousedown_fired = true;

            let element = e.target;
            while (element && !$(element).hasClass("jstree-node")) {
                element = element.parentNode;
            }

            if (e.type === "mousedown" && e.button === 0 && $(e.target).hasClass("jstree-wholerow")) {
                let anchor = $(element).find(".jstree-anchor");
                if (anchor.length)
                    anchor [0]._mousedown_fired = true;
            }
            if (e.type === "mousedown" && e.button === 1 && $(e.target).hasClass("jstree-anchor")) {
                let anchor = $(element).find(".jstree-anchor");
                if (anchor.length)
                    anchor[0]._mousedown_fired = false;
            }

            let clickable = element.getAttribute("data-clickable");
            let id = element.getAttribute("data-id");
            let external = element.getAttribute("data-external");

            if (clickable && !e.ctrlKey && !e.shiftKey) {
                backend.getNode(parseInt(id)).then(node => {
                    if (node) {
                        //console.log(node);
                        browser.runtime.sendMessage({type: "BROWSE_NODE", node: node});
                    }
                });
            }
            return false;
        }
    }

    traverse(root, visitor) {
        let _tree = this._jstree;
        function doTraverse(root) {
            if (!settings.show_firefox_toolbar() && root.original && root.original.external_id === FIREFOX_BOOKMARK_TOOLBAR
                || !settings.show_firefox_mobile() && root.original && root.original.external_id === FIREFOX_BOOKMARK_MOBILE
                || root.original && root.original.uuid === CLOUD_EXTERNAL_NAME)
                return;

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

    static styleFirefoxFolders(node) {
        if (node.external === FIREFOX_SHELF_NAME && node.external_id === FIREFOX_BOOKMARK_MENU) {
            node.icon = "/icons/bookmarksMenu.svg";
            node.li_attr = {"class": "browser-bookmark-menu"};
            node.special_browser_folder = true;
        }
        else if (node.external === FIREFOX_SHELF_NAME && node.external_id === FIREFOX_BOOKMARK_UNFILED) {
            node.icon = "/icons/unfiledBookmarks.svg";
            node.li_attr = {"class": "browser-unfiled-bookmarks"};
            node.special_browser_folder = true;
        }
        else if (node.external === FIREFOX_SHELF_NAME && node.external_id === FIREFOX_BOOKMARK_TOOLBAR) {
            node.icon = "/icons/bookmarksToolbar.svg";
            node.li_attr = {"class": "browser-bookmark-toolbar"};
            if (!settings.show_firefox_toolbar())
                node.state = {hidden: true};
            node.special_browser_folder = true;
        }
        else if (node.external === FIREFOX_SHELF_NAME && node.external_id === FIREFOX_BOOKMARK_MOBILE) {
            if (!settings.show_firefox_mobile())
                node.state = {hidden: true};
            node.special_browser_folder = true;
        }
    }

    static toJsTreeNode(n) {
        n.text = n.name;

        n.parent = n.parent_id;
        if (!n.parent)
            n.parent = "#";

        if (n.type == NODE_TYPE_SHELF && n.external === FIREFOX_SHELF_NAME) {
            n.li_attr = {"class": "browser-logo"};
            if (!settings.show_firefox_bookmarks()) {
                n.state = {hidden: true};
            }
            if (settings.capitalize_builtin_shelf_names())
                n.text = n.name.capitalizeFirstLetter();

            BookmarkTree.styleFirefoxFolders(n);
        }
        else if (n.type == NODE_TYPE_SHELF && n.external === CLOUD_EXTERNAL_NAME) {
            if (settings.capitalize_builtin_shelf_names())
                n.text = n.name.capitalizeFirstLetter();
            n.li_attr = {"class": "cloud-shelf"};
            n.icon = "var(--themed-cloud-icon)";
        }
        else if (n.type == NODE_TYPE_SHELF && n.external === RDF_EXTERNAL_NAME) {
            n.li_attr = {"class": "rdf-archive"};
            n.icon = "/icons/tape.svg";
        }
        else if (n.type == NODE_TYPE_SHELF) {
            if (n.name && isSpecialShelf(n.name) && settings.capitalize_builtin_shelf_names())
                n.text = n.name.capitalizeFirstLetter();
            n.icon = "/icons/shelf.svg";
            n.li_attr = {"class": "scrapyard-shelf"};
        }
        else if (n.type == NODE_TYPE_GROUP) {
            n.icon = "/icons/group.svg";
            n.li_attr = {
                "class": "scrapyard-group",
            };

            BookmarkTree.styleFirefoxFolders(n);
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
                "title": `${n.text}${uri}`,
                "data-id": n.id,
                "data-clickable": "true"
            };

            if (n.type == NODE_TYPE_ARCHIVE)
                n.li_attr.class += " archive-node";

            n.a_attr = {
                "class": n.has_notes? "has-notes": ""
            };

            if (n.todo_state) {
                n.a_attr.class += BookmarkTree._styleTODO(n);

                if (n._extended_todo) {
                    n.li_attr.class += " extended-todo";
                    n.text = BookmarkTree._formatTODO(n);
                }
            }

            if (n.type == NODE_TYPE_NOTES) {
                n.icon = "/icons/notes.svg";
                n.li_attr.class += " scrapyard-notes";
            }

             //n.fallbackIcon = "var(--themed-globe-icon)";

            if (!n.icon) {
                n.icon = "var(--themed-globe-icon)";
                n.a_attr.class += " generic-icon";
            }
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
            if (more.ref && more.ref.id == FIREFOX_SHELF_ID
                || parent.id == FIREFOX_SHELF_ID || node.parent == FIREFOX_SHELF_ID)
                return false;

            if (node.original.external !== RDF_EXTERNAL_NAME && parent.original.external === RDF_EXTERNAL_NAME
                    || node.original.external === RDF_EXTERNAL_NAME && more.ref
                    && more.ref.original.external !== RDF_EXTERNAL_NAME)
                return false;
        }
        return true;
    }

    static moveNode(_, data) {
        let tree = this._jstree; //$(this).jstree(true);
        let parent = tree.get_node(data.parent);

        if (data.parent != data.old_parent) {
            let node = tree.get_node(data.node);

            if (this.startProcessingIndication)
                this.startProcessingIndication();

            browser.runtime.sendMessage({type: "MOVE_NODES", node_ids: [node.original.id], dest_id: parent.original.id})
                .then(async new_nodes => { // keep jstree nodes synchronized with database
                    for (let n of new_nodes) {
                        let tree_node = tree.get_node(n.id);
                        tree_node.original = BookmarkTree.toJsTreeNode(n);

                        let old_original = this.data.find(d => d.id == n.id);
                        if (old_original)
                            this.data[this.data.indexOf(old_original)] = n;
                        else
                            this.data.push(n);
                    }
                    await BookmarkTree.reorderNodes(tree, parent);

                    if (this.stopProcessingIndication)
                        this.stopProcessingIndication();
                }).catch(() => {
                    if (this.stopProcessingIndication)
                        this.stopProcessingIndication();
                });
        }
        else
            BookmarkTree.reorderNodes(tree, parent);
    }

    static reorderNodes(tree, parent) {
        let siblings = parent.children.map(c => tree.get_node(c));

        let positions = [];
        for (let i = 0; i < siblings.length; ++i) {
            let node = {};
            node.id = siblings[i].original.id;
            node.uuid = siblings[i].original.uuid;
            node.external = siblings[i].original.external;
            node.external_id = siblings[i].original.external_id;
            node.pos = i;
            positions.push(node);
        }

        return browser.runtime.sendMessage({type: "REORDER_NODES", positions: positions});
    }

    /* context menu listener */
    contextMenu(ctx_node) { // TODO: i18n
        let self = this;
        let tree = this._jstree;
        let selected_nodes = tree.get_selected(true) || [];
        let multiselect = selected_nodes.length > 1;
        let all_nodes = this.data;
        let ctx_node_data = ctx_node.original;

        function setTODOState(state) {
            let selected_ids = selected_nodes.map(n => n.original.type === NODE_TYPE_GROUP
                                                            || n.original.type === NODE_TYPE_SHELF
                                                        ? n.children
                                                        : n.original.id);
            let todo_states = [];
            let marked_nodes = selected_ids.flat().map(id => tree.get_node(id));

            selected_ids = marked_nodes.filter(n => isEndpoint(n.original))
                .map(n => parseInt(n.id));

            selected_ids.forEach(n => todo_states.push({id: n, todo_state: state}));

            backend.setTODOState(todo_states).then(() => {
                selected_ids.forEach(id => {
                    let node = tree.get_node(id);
                    node.original.todo_state = state;
                    node.a_attr.class = node.a_attr.class.replace(/todo-state-[a-zA-Z]+/g, "");
                    node.a_attr.class += BookmarkTree._styleTODO(node.original);
                    node.text = node.text.replace(/todo-state-[a-zA-Z]+/g, node.a_attr.class);
                    tree.redraw_node(node, true, false, true);
                });
            });
        }

        let items = {
            openItem: {
                label: "Open",
                action: function () {
                    for (let n of selected_nodes) {
                        browser.runtime.sendMessage({type: "BROWSE_NODE", node: n.original});
                    }
                }
            },
            openAllItem: {
                label: "Open All",
                action: function () {
                    let children = all_nodes.filter(n => ctx_node.children.some(id => id == n.id)
                            && isEndpoint(n));
                    children.forEach(c => browser.runtime.sendMessage({type: "BROWSE_NODE", node: c}))
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
                    backend.createGroup(ctx_node_data.id, "New Folder").then(async group => {
                        BookmarkTree.toJsTreeNode(group);
                        tree.deselect_all(true);

                        let group_node = tree.get_node(tree.create_node(ctx_node, group));
                        tree.select_node(group_node);

                        await BookmarkTree.reorderNodes(tree, ctx_node);

                        tree.edit(group_node, null, (node, success, cancelled) => {
                            if (success && !cancelled)
                                backend.renameGroup(group.id, node.text).then(group => {
                                    group_node.original.name = group_node.original.text = group.name;
                                    tree.rename_node(group_node, group.name);
                                });
                        });
                    });
                }
            },
            newSeparatorItem: {
                label: "New Separator",
                action: function () {
                    let parent = tree.get_node(ctx_node.parent);

                    backend.addSeparator(parent.original.id).then(separator => {
                            let position = $.inArray(ctx_node.id, parent.children);
                            tree.create_node(parent, BookmarkTree.toJsTreeNode(separator), position + 1);
                            BookmarkTree.reorderNodes(tree, parent);
                        });
                }
            },
            newNotesItem: {
                label: "New Notes",
                action: () => {
                    backend.addNotesNode(ctx_node_data.id, "New Notes").then(notes => {
                        BookmarkTree.toJsTreeNode(notes);
                        this.data.push(notes);
                        tree.deselect_all(true);

                        let notes_node = tree.get_node(tree.create_node(ctx_node, notes));
                        tree.select_node(notes_node);

                        BookmarkTree.reorderNodes(tree, ctx_node);

                        tree.edit(notes_node, null, (node, success, cancelled) => {
                            if (success && !cancelled)
                                backend.updateNode({id: notes.id, name: node.text}).then(() => {
                                    notes_node.original.name = node.text;
                                });
                        });
                    });
                }
            },
            shareItem: {
                separator_before: true,
                label: "Share",
                submenu: {
                    pocketItem: {
                        label: "Pocket",
                        icon: "icons/pocket.svg",
                        action: async function () {
                            const auth_handler = auth_url => new Promise(async (resolve, reject) => {
                                let pocket_tab = await browser.tabs.create({url: auth_url});
                                let listener = async (id, changed, tab) => {
                                    if (id === pocket_tab.id) {
                                        if (changed.url && !changed.url.includes("getpocket.com")) {
                                            await browser.tabs.onUpdated.removeListener(listener);
                                            browser.tabs.remove(pocket_tab.id);
                                            resolve();
                                        }
                                    }
                                };
                                browser.tabs.onUpdated.addListener(listener);
                            });

                            let pocket = new GetPocket({consumer_key: "87251-b8d5db3009affab6297bc799",
                                                        access_token: settings.pocket_access_token(),
                                                        redirect_uri: "https://gchristensen.github.io/scrapyard/",
                                                        auth_handler: auth_handler,
                                                        persist_token: token => settings.pocket_access_token(token)});

                            if (selected_nodes) {
                                let actions = selected_nodes.map(n => ({
                                    action: "add",
                                    title: n.original.name,
                                    url: n.original.uri,
                                    tags: n.original.tags
                                }));
                                await pocket.modify(actions).catch(e => console.log(e));

                                showNotification(`Successfully added bookmark${selected_nodes.length > 1? "s": ""} to Pocket.`)
                            }
                        }
                    },
                    dropboxItem: {
                        label: "Dropbox",
                        icon: "icons/dropbox.png",
                        action: async function () {
                            for (let node of selected_nodes) {
                                let filename, content;

                                if (node.original.type === NODE_TYPE_ARCHIVE) {
                                    let blob = await backend.fetchBlob(node.original.id);
                                    if (blob) {
                                        if (blob.byte_length) {
                                            let byteArray = new Uint8Array(blob.byte_length);
                                            for (let i = 0; i < blob.data.length; ++i)
                                                byteArray[i] = blob.data.charCodeAt(i);

                                            blob.data = byteArray;
                                        }

                                        let type = blob.type? blob.type: "text/html";
                                        filename = node.original.name + (type.endsWith("pdf")? ".pdf": ".html");
                                        content = new Blob([blob.data],{type: type});
                                    }
                                }
                                else if (node.original.type === NODE_TYPE_BOOKMARK) {
                                    filename = node.original.name + ".url";
                                    content = "[InternetShortcut]\nURL=" + node.original.uri;
                                }
                                else if (node.original.type === NODE_TYPE_NOTES) {
                                    let notes = await backend.fetchNotes(node.original.id);

                                    if (notes) {
                                        filename = node.original.name + ".org";
                                        content = notes.content;
                                    }
                                }

                                if (filename && content) {
                                    await dropboxBackend.upload("/", filename, content);
                                    showNotification(`Successfully shared bookmark${selected_nodes.length > 1? "s": ""} to Dropbox.`)
                                }
                            }
                        }
                    }
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
                separator_before: ctx_node_data.type === NODE_TYPE_SHELF || ctx_node_data.parent_id == FIREFOX_SHELF_ID,
                _disabled: !(tree.can_paste() && isContainer(ctx_node_data)),
                action: function () {
                    let buffer = tree.get_buffer();
                    let selection =  Array.isArray(buffer.node)
                        ? buffer.node.map(n => n.original.id)
                        : [buffer.node.original.id];

                    if (self.startProcessingIndication)
                        self.startProcessingIndication();

                    (buffer.mode == "copy_node"
                        ? browser.runtime.sendMessage({type: "COPY_NODES", node_ids: selection, dest_id: ctx_node_data.id})
                        : browser.runtime.sendMessage({type: "MOVE_NODES", node_ids: selection, dest_id: ctx_node_data.id}))
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

                                let old_original = all_nodes.find(d => d.id == n.id);
                                if (old_original)
                                    all_nodes[all_nodes.indexOf(old_original)] = n;
                                else
                                    all_nodes.push(n);
                            }

                            BookmarkTree.reorderNodes(tree, ctx_node);

                            tree.clear_buffer();

                            if (self.stopProcessingIndication)
                                self.stopProcessingIndication();
                        }).catch(() => {
                            if (self.stopProcessingIndication)
                                self.stopProcessingIndication();
                        });
                }
            },
            viewNotesItem: {
                separator_before: true,
                label: "Open Notes",
                action: () => {
                    browser.runtime.sendMessage({type: "BROWSE_NOTES", id: ctx_node_data.id, uuid: ctx_node_data.uuid});
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
                        if (isSpecialShelf(ctx_node_data.name)) {
                            // TODO: i18n
                            showNotification({message: "A built-in shelf could not be deleted."});
                            return;
                        }

                        confirm("{Warning}", "Do you really want to delete '" + ctx_node_data.name + "'?").then(() => {
                            if (ctx_node_data.name) {

                                if (self.startProcessingIndication)
                                    self.startProcessingIndication();

                                browser.runtime.sendMessage({type: "DELETE_NODES", node_ids: ctx_node_data.id})
                                    .then(() => {
                                        if (self.stopProcessingIndication)
                                            self.stopProcessingIndication();

                                        tree.delete_node(ctx_node_data.id);

                                        if (this.onDeleteShelf)
                                            this.onDeleteShelf(ctx_node_data);
                                    }).catch(() => {
                                        if (self.stopProcessingIndication)
                                            self.stopProcessingIndication();
                                    });
                            }
                        });
                    }
                    else {
                        confirm("{Warning}", "{ConfirmDeleteItem}").then(() => {
                            let selected_ids = selected_nodes.map(n => n.original.id);

                            if (self.startProcessingIndication)
                                self.startProcessingIndication();

                            browser.runtime.sendMessage({type: "DELETE_NODES", node_ids: selected_ids}).then(() => {
                                if (self.stopProcessingIndication)
                                    self.stopProcessingIndication();

                                tree.delete_node(selected_nodes);
                            }).catch(() => {
                                if (self.stopProcessingIndication)
                                    self.stopProcessingIndication();
                            });
                        });
                    }
                }
            },
            propertiesItem: {
                separator_before: true,
                label: "Properties...",
                action: function () {
                    if (isEndpoint(ctx_node.original)) {
                        showDlg("properties", ctx_node_data).then(data => {
                            let live_data = all_nodes.find(n => n.id == ctx_node_data.id);
                            Object.assign(live_data, data);

                            backend.updateBookmark(Object.assign(ctx_node_data, data)).then(() => {
                                if (!ctx_node_data._extended_todo) {
                                    tree.rename_node(ctx_node, ctx_node_data.name);
                                }
                                else {
                                    tree.rename_node(ctx_node, BookmarkTree._formatTODO(ctx_node_data));
                                }
                                tree.redraw_node(ctx_node, true, false, true);
                            });
                        });
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
            },
            rdfPathItem: {
                separator_before: true,
                label: "RDF Directory...",
                action: () => {
                    showDlg("prompt", {caption: "RDF Directory", label: "Path", title: ctx_node_data.uri})
                        .then(async data => {
                            let node = await backend.getNode(ctx_node_data.id);
                            ctx_node_data.uri = node.uri = data.title;
                            backend.updateNode(node);
                    });
                }
            }
        };


        switch (ctx_node.original.type) {
            case NODE_TYPE_SHELF:
                delete items.cutItem;
                delete items.copyItem;
                delete items.newSeparatorItem;
                if (ctx_node.original.id == FIREFOX_SHELF_ID) {
                    items = {};
                }
                if (ctx_node_data.external !== RDF_EXTERNAL_NAME) {
                    delete items.rdfPathItem;
                }
            case NODE_TYPE_GROUP:
                //delete items.newSeparatorItem;
                delete items.openItem;
                delete items.openOriginalItem;
                delete items.propertiesItem;
                delete items.copyLinkItem;
                delete items.shareItem;
                if (ctx_node_data.type === NODE_TYPE_GROUP)
                    delete items.rdfPathItem;
                if (ctx_node.original.external)
                    delete items.newNotesItem;
                if (ctx_node.original.special_browser_folder) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.renameItem;
                    delete items.deleteItem;
                    delete items.newSeparatorItem;
                }
                if (ctx_node_data.external === RDF_EXTERNAL_NAME) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.pasteItem;
                    delete items.newFolderItem;
                }
                break;
            case NODE_TYPE_NOTES:
                delete items.shareItem.submenu.pocketItem;
            case NODE_TYPE_BOOKMARK:
                delete items.openOriginalItem;
            case NODE_TYPE_ARCHIVE:
                delete items.newNotesItem;
                delete items.openAllItem;
                delete items.sortItem;
                delete items.newFolderItem;
                delete items.renameItem;
                delete items.rdfPathItem;
                if (ctx_node_data.external === RDF_EXTERNAL_NAME) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.pasteItem;
                    delete items.shareItem.submenu.dropboxItem;
                }
                break;
        }

        if (ctx_node.original.type === NODE_TYPE_SEPARATOR) {
            for (let k in items)
                if (!["deleteItem"].find(s => s === k))
                    delete items[k];
        }

        if (!isEndpoint(ctx_node.original)) {
            delete items.viewNotesItem;
        }

        if (ctx_node.original._extended_todo) {
            delete items.newSeparatorItem;
        }

        if (multiselect) {
            items["sortItem"] && (items["sortItem"]._disabled = true);
            items["renameItem"] && (items["renameItem"]._disabled = true);
            items["openAllItem"] && (items["openAllItem"]._disabled = true);
            items["copyLinkItem"] && (items["copyLinkItem"]._disabled = true);
            items["newFolderItem"] && (items["newFolderItem"]._disabled = true);
            items["viewNotesItem"] && (items["viewNotesItem"]._disabled = true);
            items["propertiesItem"] && (items["propertiesItem"]._disabled = true);
            items["newSeparatorItem"] && (items["newSeparatorItem"]._disabled = true);
            items["openOriginalItem"] && (items["openOriginalItem"]._disabled = true);
        }

        return items;
    }
}


export {BookmarkTree};
