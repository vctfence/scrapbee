import {backend} from "./backend.js"
import {dropboxBackend} from "./backend_dropbox.js"

import {showDlg, alert, confirm} from "./dialog.js"
import {settings} from "./settings.js";
import {GetPocket} from "./lib/pocket.js";
import {getThemeVar, showNotification} from "./utils.js";
import {
    CLOUD_EXTERNAL_NAME,
    CLOUD_SHELF_ID,
    ENDPOINT_TYPES,
    EVERYTHING,
    FIREFOX_BOOKMARK_MENU,
    FIREFOX_BOOKMARK_MOBILE,
    FIREFOX_BOOKMARK_TOOLBAR,
    FIREFOX_BOOKMARK_UNFILED,
    FIREFOX_SHELF_ID,
    FIREFOX_SHELF_NAME,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP,
    NODE_TYPE_NOTES,
    NODE_TYPE_SEPARATOR,
    NODE_TYPE_SHELF,
    RDF_EXTERNAL_NAME,
    TODO_NAMES,
    TODO_STATE_CANCELLED,
    TODO_STATE_DONE,
    TODO_STATE_POSTPONED,
    TODO_STATE_TODO,
    TODO_STATE_WAITING,
    isContainer,
    isEndpoint,
    isSpecialShelf, DEFAULT_POSITION
} from "./storage_constants.js";

export const TREE_STATE_PREFIX = "tree-state-";

class BookmarkTree {
    constructor(element, inline= false) {
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


        this.iconCache = new Map();

        this._jstree.__icon_set_hook = (node) => {
            if (node.icon.startsWith("var("))
                return node.icon;
            else if (node.icon.startsWith("/"))
                return `url("${node.icon}")`;
            else {
                if (node.original.stored_icon) {
                    let icon = this.iconCache.get(node.icon);
                    if (icon)
                        return `url("${icon}")`;
                    else
                        return null;
                }
                else
                    return `url("${node.icon}")`;
            }
        }

        this._jstree.__icon_check_hook = (a_element, node) => {
            if (node.__icon_validated || !node.icon || (node.icon && node.icon.startsWith("var("))
                || (node.icon && node.icon.startsWith("/")))
                return;

            setTimeout(async () => {
                let getIconElement = async () => {
                    const a_element2 = document.getElementById(a_element.id);
                    if (a_element2) {
                        return a_element2.childNodes[0];
                    }
                    else {
                        return new Promise((resolve, reject) => {
                            setTimeout(() => {
                                const a_element2 = document.getElementById(a_element.id);
                                if (a_element2) {
                                    resolve(a_element2.childNodes[0]);
                                }
                                else {
                                    console.error("can't find icon element");
                                    resolve(null);
                                }
                            }, 100);
                        })
                    }
                }

                if (node.original.stored_icon) {
                    const cached = this.iconCache.get(node.icon);
                    const base64Url = cached || (await backend.fetchIcon(node.original.id));

                    if (base64Url) {
                        if (!cached)
                            this.iconCache.set(node.icon, base64Url);
                        (await getIconElement()).style.backgroundImage = `url("${base64Url}")`;
                    }
                }
                else {
                    let image = new Image();

                    image.onerror = async e => {
                        const fallback_icon = "var(--themed-globe-icon)";
                        node.icon = fallback_icon;
                        (await getIconElement()).style.backgroundImage = fallback_icon;
                    };
                    image.src = node.icon;
                }
            }, 0);

            node.__icon_validated = true;
        }

        $(document).on("mousedown", ".jstree-node", e => this.handleMouseClick(e));
        $(document).on("click", ".jstree-anchor", e => this.handleMouseClick(e));
        // $(document).on("auxclick", ".jstree-anchor", e => e.preventDefault());
    }

    clearIconCache() {
        this.iconCache = new Map();
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
                backend.getNode(parseInt(id)).then(async node => {
                    if (node) {
                        //console.log(node);

                        let active_tab;

                        if (settings.open_bookmark_in_active_tab()) {
                            let active_tabs = await browser.tabs.query({active: true, currentWindow: true});
                            active_tab = e.button === 0 && active_tabs && active_tabs.length? active_tabs[0] : undefined;
                        }

                        browser.runtime.sendMessage({type: "BROWSE_NODE", node: node, tab: active_tab, preserveHistory: true});
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
            n.text = "─".repeat(60);
            n.icon = false;
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
                n.icon = "var(--themed-notes-icon)";
                n.li_attr.class += " scrapyard-notes";
            }

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

    update(nodes, everything = false, clearSelected = false) {
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

        if (clearSelected)
            this._jstree.deselect_all(true);
    }

    // Used to make a flat list in the tree-view (e.g. in search)
    list(nodes, state_key, clearSelected = false) {
        if (state_key)
            this.stateKey = TREE_STATE_PREFIX + state_key;

        nodes.forEach(BookmarkTree.toJsTreeNode);
        nodes.forEach(n => n.parent = "#");

        this.data = nodes;
        this._jstree.refresh(true);

        if (clearSelected)
            this._jstree.deselect_all(true);
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
                .then(async new_nodes => { // keep jstree nodes synchronized with the database
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
    contextMenu(ctxNode) { // TODO: i18n
        let self = this;
        let tree = this._jstree;
        let selectedNodes = tree.get_selected(true) || [];
        let multiselect = selectedNodes.length > 1;
        let allNodes = this.data;
        let ctxNodeData = ctxNode.original;

        function setTODOState(state) {
            let selected_ids = selectedNodes.map(n => n.original.type === NODE_TYPE_GROUP
                                                            || n.original.type === NODE_TYPE_SHELF
                                                        ? n.children
                                                        : n.original.id);
            let todo_states = [];
            let marked_nodes = selected_ids.flat().map(id => tree.get_node(id));

            selected_ids = marked_nodes.filter(n => isEndpoint(n.original))
                .map(n => parseInt(n.id));

            selectedNodes = marked_nodes.filter(n => selected_ids.some(id => id === n.original.id))
                .map(n => n.original);

            selectedNodes.forEach(n => todo_states.push({id: n.id, uuid: n.uuid, external: n.external, todo_state: state}));

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
                    for (let n of selectedNodes) {
                        browser.runtime.sendMessage({type: "BROWSE_NODE", node: n.original});
                    }
                }
            },
            openAllItem: {
                label: "Open All",
                action: function () {
                    let children = allNodes.filter(n => ctxNode.children.some(id => id == n.id)
                            && isEndpoint(n));
                    children.forEach(c => browser.runtime.sendMessage({type: "BROWSE_NODE", node: c}))
                }
            },
            sortItem: {
                label: "Sort by Name",
                action: function () {
                    let children = ctxNode.children.map(c => tree.get_node(c));
                    children.sort((a, b) => a.text.localeCompare(b.text));
                    ctxNode.children = children.map(c => c.id);

                    tree.redraw_node(ctxNode, true, false, true);
                    BookmarkTree.reorderNodes(tree, ctxNode);
                }
            },
            openOriginalItem: {
                label: "Open Original URL",
                action: function () {
                    browser.tabs.create({
                        "url": ctxNodeData.uri
                    });
                }
            },
            copyLinkItem: {
                label: "Copy Link",
                action: function () {
                    navigator.clipboard.writeText(ctxNodeData.uri);
                }
            },
            newFolderItem: {
                label: "New Folder",
                action: function () {
                    backend.createGroup(ctxNodeData.id, "New Folder").then(async group => {
                        BookmarkTree.toJsTreeNode(group);
                        tree.deselect_all(true);

                        let groupNode = tree.get_node(tree.create_node(ctxNode, group, 0));
                        tree.select_node(groupNode);

                        await BookmarkTree.reorderNodes(tree, ctxNode);

                        tree.edit(groupNode, null, (node, success, cancelled) => {
                            if (success && !cancelled)
                                backend.renameGroup(group.id, node.text).then(group => {
                                    groupNode.original.name = groupNode.original.text = group.name;
                                    tree.rename_node(groupNode, group.name);
                                });
                        });
                    });
                }
            },
            newFolderAfterItem: {
                label: "New Folder After",
                action: function () {
                    let parent = tree.get_node(ctxNode.parent);
                    let position = $.inArray(ctxNode.id, parent.children);

                    backend.createGroup(parent.original.id, "New Folder").then(async group => {
                        BookmarkTree.toJsTreeNode(group);
                        tree.deselect_all(true);

                        let groupNode = tree.get_node(tree.create_node(parent, group, position + 1));
                        tree.select_node(groupNode);

                        await BookmarkTree.reorderNodes(tree, parent);

                        tree.edit(groupNode, null, (node, success, cancelled) => {
                            if (success && !cancelled)
                                backend.renameGroup(group.id, node.text).then(group => {
                                    groupNode.original.name = groupNode.original.text = group.name;
                                    tree.rename_node(groupNode, group.name);
                                });
                        });
                    });
                }
            },
            newSeparatorItem: {
                label: "New Separator",
                action: function () {
                    let parent = tree.get_node(ctxNode.parent);

                    backend.addSeparator(parent.original.id).then(separator => {
                            let position = $.inArray(ctxNode.id, parent.children);
                            tree.create_node(parent, BookmarkTree.toJsTreeNode(separator), position + 1);
                            BookmarkTree.reorderNodes(tree, parent);
                        });
                }
            },
            newNotesItem: {
                label: "New Notes",
                action: () => {
                    backend.addNotes(ctxNodeData.id, "New Notes").then(notes => {
                        BookmarkTree.toJsTreeNode(notes);
                        this.data.push(notes);
                        tree.deselect_all(true);

                        let notes_node = tree.get_node(tree.create_node(ctxNode, notes));
                        tree.select_node(notes_node);

                        BookmarkTree.reorderNodes(tree, ctxNode);

                        tree.edit(notes_node, null, (node, success, cancelled) => {
                            if (success && !cancelled) {
                                notes.name = node.text;
                                backend.updateBookmark(notes).then(() => {
                                    notes_node.original.name = node.text;
                                });
                            }
                        });
                    });
                }
            },
            shareItem: {
                separator_before: true,
                label: "Share",
                submenu: {
                    cloudItem: {
                        label: "Cloud",
                        icon: getThemeVar("--theme-background") === "white"? "icons/cloud.png": "icons/cloud2.png",
                        action: async function () {
                            self.startProcessingIndication();
                            let newNodes = await backend.copyNodes([ctxNodeData.id], CLOUD_SHELF_ID);
                            let newNode = newNodes.find(n => n.old_id == ctxNodeData.id);
                            newNode.pos = DEFAULT_POSITION;
                            await backend.updateNode(newNode);
                            self.stopProcessingIndication();
                        }
                    },
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

                            if (selectedNodes) {
                                let actions = selectedNodes.map(n => ({
                                    action: "add",
                                    title: n.original.name,
                                    url: n.original.uri,
                                    tags: n.original.tags
                                }));
                                await pocket.modify(actions).catch(e => console.log(e));

                                showNotification(`Successfully added bookmark${selectedNodes.length > 1
                                    ? "s"
                                    : ""} to Pocket.`)
                            }
                        }
                    },
                    dropboxItem: {
                        label: "Dropbox",
                        icon: "icons/dropbox.png",
                        action: async function () {
                            for (let node of selectedNodes) {
                                let filename, content;

                                if (node.original.type === NODE_TYPE_ARCHIVE) {
                                    let blob = await backend.fetchBlob(node.original.id);
                                    if (blob) {
                                        if (blob.byte_length) {
                                            blob.data = backend.blob2Array(blob);
                                        }

                                        let type = blob.type? blob.type: "text/html";
                                        filename = node.original.name
                                        if (!(filename.endsWith("pdf") || filename.endsWith("html")))
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
                                    showNotification(`Successfully shared bookmark${selectedNodes.length > 1
                                        ? "s"
                                        : ""} to Dropbox.`)
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
                    tree.cut(selectedNodes);
                }
            },
            copyItem: {
                label: "Copy",
                action: function () {
                    tree.copy(selectedNodes);
                }
            },
            pasteItem: {
                label: "Paste",
                separator_before: ctxNodeData.type === NODE_TYPE_SHELF || ctxNodeData.parent_id == FIREFOX_SHELF_ID,
                _disabled: !(tree.can_paste() && isContainer(ctxNodeData)),
                action: function () {
                    let buffer = tree.get_buffer();
                    let selection =  Array.isArray(buffer.node)
                        ? buffer.node.map(n => n.original.id)
                        : [buffer.node.original.id];

                    if (self.startProcessingIndication)
                        self.startProcessingIndication();

                    (buffer.mode == "copy_node"
                        ? browser.runtime.sendMessage({type: "COPY_NODES", node_ids: selection, dest_id: ctxNodeData.id})
                        : browser.runtime.sendMessage({type: "MOVE_NODES", node_ids: selection, dest_id: ctxNodeData.id}))
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

                                let old_original = allNodes.find(d => d.id == n.id);
                                if (old_original)
                                    allNodes[allNodes.indexOf(old_original)] = n;
                                else
                                    allNodes.push(n);
                            }

                            BookmarkTree.reorderNodes(tree, ctxNode);

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
                    browser.runtime.sendMessage({type: "BROWSE_NOTES", id: ctxNodeData.id, uuid: ctxNodeData.uuid});
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
            repairIconsItem: {
                separator_before: true,
                label: "Repair icons...",
                action: async () => {
                    let query = `?repairIcons=true&scope=${ctxNodeData.id}`
                    browser.tabs.create({url: `/options.html${query}#links`, active: true});
                }
            },
            deleteItem: {
                separator_before: true,
                label: "Delete",
                action: () => {
                    if (ctxNodeData.type === NODE_TYPE_SHELF) {
                        if (isSpecialShelf(ctxNodeData.name)) {
                            // TODO: i18n
                            showNotification({message: "A built-in shelf could not be deleted."});
                            return;
                        }

                        confirm("{Warning}", "Do you really want to delete '" + ctxNodeData.name + "'?")
                            .then(() => {
                                if (ctxNodeData.name) {

                                    if (self.startProcessingIndication)
                                        self.startProcessingIndication();

                                    browser.runtime.sendMessage({type: "DELETE_NODES", node_ids: ctxNodeData.id})
                                        .then(() => {
                                            if (self.stopProcessingIndication)
                                                self.stopProcessingIndication();

                                            tree.delete_node(ctxNodeData.id);

                                            if (this.onDeleteShelf)
                                                this.onDeleteShelf(ctxNodeData);
                                        }).catch(() => {
                                            if (self.stopProcessingIndication)
                                                self.stopProcessingIndication();
                                        });
                                }
                        });
                    }
                    else {
                        confirm("{Warning}", "{ConfirmDeleteItem}").then(() => {
                            let selected_ids = selectedNodes.map(n => n.original.id);

                            if (self.startProcessingIndication)
                                self.startProcessingIndication();

                            browser.runtime.sendMessage({type: "DELETE_NODES", node_ids: selected_ids}).then(() => {
                                if (self.stopProcessingIndication)
                                    self.stopProcessingIndication();

                                tree.delete_node(selectedNodes);
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
                action: async function () {
                    if (isEndpoint(ctxNode.original)) {

                        let properties = await backend.getNode(ctxNodeData.id);

                        properties.comments = await backend.fetchComments(properties.id);
                        let commentsPresent = !!properties.comments;

                        showDlg("properties", properties).then(async newPproperties => {

                            Object.assign(properties, newPproperties);

                            if (!properties.icon) {
                                properties.icon = null;
                                properties.stored_icon = false;
                            }

                            self.startProcessingIndication();

                            properties.has_comments = !!properties.comments;

                            if (commentsPresent || properties.has_comments)
                                await backend.storeComments(properties.id, properties.comments);

                            delete properties.comments;

                            let live_data = allNodes.find(n => n.id == properties.id);
                            Object.assign(live_data, properties);

                            self.stopProcessingIndication();

                            if (!ctxNodeData._extended_todo)
                                tree.rename_node(ctxNode, properties.name);
                            else {
                                Object.assign(ctxNodeData, properties);
                                tree.rename_node(ctxNode, BookmarkTree._formatTODO(ctxNodeData));
                            }
                            tree.redraw_node(ctxNode, true, false, true);

                            $("#" + properties.id).prop('title', `${properties.name}\x0A${properties.uri}`);
                        });
                    }
                }
            },
            renameItem: {
                label: "Rename",
                action: () => {
                    switch (ctxNode.original.type) {
                        case NODE_TYPE_SHELF:
                            if (this.onRenameShelf)
                                this.onRenameShelf(ctxNodeData);
                            break;
                        case NODE_TYPE_GROUP:
                            tree.edit(ctxNode, null, (node, success, cancelled) => {
                                if (success && !cancelled)
                                    backend.renameGroup(ctxNodeData.id, node.text).then(group => {
                                        ctxNodeData.name = ctxNodeData.text = group.name;
                                        tree.rename_node(ctxNode, group.name);
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
                    showDlg("prompt", {caption: "RDF Directory", label: "Path", title: ctxNodeData.uri})
                        .then(async data => {
                            let node = await backend.getNode(ctxNodeData.id);
                            ctxNodeData.uri = node.uri = data.title;
                            backend.updateNode(node);
                    });
                }
            }
        };


        switch (ctxNode.original.type) {
            case NODE_TYPE_SHELF:
                delete items.cutItem;
                delete items.copyItem;
                delete items.shareItem;
                delete items.newSeparatorItem;
                delete items.newFolderAfterItem;
                if (ctxNode.original.id == FIREFOX_SHELF_ID) {
                    items = {};
                }
                if (ctxNodeData.external !== RDF_EXTERNAL_NAME) {
                    delete items.rdfPathItem;
                }
            case NODE_TYPE_GROUP:
                //delete items.newSeparatorItem;
                delete items.openItem;
                delete items.openOriginalItem;
                delete items.propertiesItem;
                delete items.copyLinkItem;
                //delete items.shareItem;
                if (items.shareItem) {
                    delete items.shareItem.submenu.pocketItem;
                    delete items.shareItem.submenu.dropboxItem;
                }
                if (ctxNodeData.type === NODE_TYPE_GROUP)
                    delete items.rdfPathItem;
                if (ctxNode.original.external && ctxNode.original.external !== CLOUD_EXTERNAL_NAME)
                    delete items.newNotesItem;
                if (ctxNode.original.special_browser_folder) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.renameItem;
                    delete items.deleteItem;
                    delete items.newSeparatorItem;
                    delete items.newFolderAfterItem;
                }
                if (ctxNodeData.external === RDF_EXTERNAL_NAME) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.pasteItem;
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
                delete items.repairIconsItem;
                if (ctxNodeData.external === RDF_EXTERNAL_NAME) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.pasteItem;
                    delete items.shareItem.submenu.dropboxItem;
                }
                break;
        }

        if (ctxNode.original.type === NODE_TYPE_SEPARATOR) {
            for (let k in items)
                if (!["deleteItem", "newFolderAfterItem"].find(s => s === k))
                    delete items[k];
        }

        if (!isEndpoint(ctxNode.original)) {
            delete items.viewNotesItem;
        }

        if (ctxNode.original._extended_todo) {
            delete items.newSeparatorItem;
            delete items.newFolderAfterItem;
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
            items["newFolderAfterItem"] && (items["newFolderAfterItem"]._disabled = true);
            items["openOriginalItem"] && (items["openOriginalItem"]._disabled = true);
        }

        return items;
    }
}


export {BookmarkTree};
