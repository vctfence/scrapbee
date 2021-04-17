import {backend} from "./backend.js"
import {dropboxBackend} from "./backend_dropbox.js"
import {cloudBackend} from "./backend_cloud.js"

import {showDlg, confirm} from "./dialog.js"
import {settings} from "./settings.js";
import {GetPocket} from "./lib/pocket.js";
import {getThemeVar, isElementInViewport, showNotification} from "./utils.js";
import {
    CLOUD_EXTERNAL_NAME,
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
    isSpecialShelf, DEFAULT_POSITION, EVERYTHING_SHELF, TODO_SHELF, DONE_SHELF, DEFAULT_SHELF_NAME
} from "./storage_constants.js";

export const TREE_STATE_PREFIX = "tree-state-";


// return the original Scrapyard node object stored in a jsTree node
let o = n => n.data;
let os = n => n?.data;

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
                items: node => this.contextMenu(node)
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

        this._jstree.__icon_set_hook = (jnode) => {
            if (jnode.icon.startsWith("var("))
                return jnode.icon;
            else if (jnode.icon.startsWith("/"))
                return `url("${jnode.icon}")`;
            else {
                if (os(jnode)?.stored_icon) {
                    let icon = this.iconCache.get(jnode.icon);
                    if (icon)
                        return `url("${icon}")`;
                    else
                        return null;
                }
                else
                    return `url("${jnode.icon}")`;
            }
        }

        this._jstree.__icon_check_hook = (a_element, jnode) => {
            if (jnode.__icon_validated || !jnode.icon || (jnode.icon && jnode.icon.startsWith("var("))
                || (jnode.icon && jnode.icon.startsWith("/")))
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

                if (os(jnode)?.stored_icon) {
                    const cached = this.iconCache.get(jnode.icon);
                    const base64Url = cached || (await backend.fetchIcon(o(jnode).id));

                    if (base64Url) {
                        if (!cached)
                            this.iconCache.set(jnode.icon, base64Url);
                        (await getIconElement()).style.backgroundImage = `url("${base64Url}")`;
                    }
                }
                else {
                    let image = new Image();

                    image.onerror = async e => {
                        const fallback_icon = "var(--themed-globe-icon)";
                        jnode.icon = fallback_icon;
                        (await getIconElement()).style.backgroundImage = fallback_icon;
                    };
                    image.src = jnode.icon;
                }
            }, 0);

            jnode.__icon_validated = true;
        }

        $(document).on("mousedown", ".jstree-node", e => this.handleMouseClick(e));
        $(document).on("click", ".jstree-anchor", e => this.handleMouseClick(e));
        // $(document).on("auxclick", ".jstree-anchor", e => e.preventDefault());

        if (!inline) {
            browser.contextualIdentities.query({}).then(containers => {
                this._containers = containers;
            });

            browser.contextualIdentities.onCreated.addListener(() => {
                browser.contextualIdentities.query({}).then(containers => {
                    this._containers = containers;
                });
            });

            browser.contextualIdentities.onRemoved.addListener(() => {
                browser.contextualIdentities.query({}).then(containers => {
                    this._containers = containers;
                });
            });
        }
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
            if (!settings.show_firefox_toolbar() && os(root).external_id === FIREFOX_BOOKMARK_TOOLBAR
                || !settings.show_firefox_mobile() && os(root).external_id === FIREFOX_BOOKMARK_MOBILE
                || os(root).uuid === CLOUD_EXTERNAL_NAME)
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

    getExportedNodes(shelf_id) {
        let special_shelf = shelf_id === EVERYTHING_SHELF || shelf_id === TODO_SHELF || shelf_id === DONE_SHELF;
        let root = special_shelf
            ? this._jstree.get_node("#")
            : this._jstree.get_node(this.odata.find(n => n.type === NODE_TYPE_SHELF).id);

        let skip_level = root.parents.length;

        let nodes = [];
        this.traverse(root, jnode => {
            let data = backend._sanitizeNode(o(jnode));
            delete data.tag_list;

            data.level = jnode.parents.length - skip_level;
            nodes.push(data);
        });

        return nodes;
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

    static styleFirefoxFolders(node, jnode) {
        if (node.external === FIREFOX_SHELF_NAME && node.external_id === FIREFOX_BOOKMARK_MENU) {
            jnode.icon = "/icons/bookmarksMenu.svg";
            jnode.li_attr = {"class": "browser-bookmark-menu"};
            node.special_browser_folder = true;
        }
        else if (node.external === FIREFOX_SHELF_NAME && node.external_id === FIREFOX_BOOKMARK_UNFILED) {
            jnode.icon = "/icons/unfiledBookmarks.svg";
            jnode.li_attr = {"class": "browser-unfiled-bookmarks"};
            node.special_browser_folder = true;
        }
        else if (node.external === FIREFOX_SHELF_NAME && node.external_id === FIREFOX_BOOKMARK_TOOLBAR) {
            jnode.icon = "/icons/bookmarksToolbar.svg";
            jnode.li_attr = {"class": "browser-bookmark-toolbar"};
            if (!settings.show_firefox_toolbar())
                jnode.state = {hidden: true};
            node.special_browser_folder = true;
        }
        else if (node.external === FIREFOX_SHELF_NAME && node.external_id === FIREFOX_BOOKMARK_MOBILE) {
            if (!settings.show_firefox_mobile())
                jnode.state = {hidden: true};
            node.special_browser_folder = true;
        }
    }

    static toJsTreeNode(node) {
        let jnode = {};

        jnode.id = node.id;
        jnode.text = node.name;
        jnode.icon = node.icon;
        jnode.data = node; // store the original Scrapyard node

        jnode.parent = node.parent_id;
        if (!jnode.parent)
            jnode.parent = "#";

        if (node.type === NODE_TYPE_SHELF && node.external === FIREFOX_SHELF_NAME) {
            jnode.li_attr = {"class": "browser-logo"};
            if (!settings.show_firefox_bookmarks()) {
                jnode.state = {hidden: true};
            }
            if (settings.capitalize_builtin_shelf_names())
                jnode.text = node.name.capitalizeFirstLetter();

            BookmarkTree.styleFirefoxFolders(node, jnode);
        }
        else if (node.type === NODE_TYPE_SHELF && node.external === CLOUD_EXTERNAL_NAME) {
            if (settings.capitalize_builtin_shelf_names())
                jnode.text = node.name.capitalizeFirstLetter();
            jnode.li_attr = {"class": "cloud-shelf"};
            jnode.icon = "var(--themed-cloud-icon)";
        }
        else if (node.type === NODE_TYPE_SHELF && node.external === RDF_EXTERNAL_NAME) {
            jnode.li_attr = {"class": "rdf-archive"};
            jnode.icon = "/icons/tape.svg";
        }
        else if (node.type === NODE_TYPE_SHELF) {
            if (node.name && isSpecialShelf(node.name) && settings.capitalize_builtin_shelf_names())
                jnode.text = node.name.capitalizeFirstLetter();
            jnode.icon = "/icons/shelf.svg";
            jnode.li_attr = {"class": "scrapyard-shelf"};
        }
        else if (node.type === NODE_TYPE_GROUP) {
            jnode.icon = "/icons/group.svg";
            jnode.li_attr = {
                "class": "scrapyard-group",
            };

            BookmarkTree.styleFirefoxFolders(node, jnode);
        }
        else if (node.type === NODE_TYPE_SEPARATOR) {
            jnode.text = "─".repeat(60);
            jnode.icon = false;
            jnode.a_attr = {
                "class": "separator-node"
            };
        }
        else if (node.type !== NODE_TYPE_SHELF) {
            let nuri = "";
            if (node.uri)
                nuri = "\x0A" + node.uri;

            jnode.li_attr = {
                "class": "show_tooltip",
                "title": `${node.text}${nuri}`,
                "data-id": node.id,
                "data-clickable": "true"
            };

            if (node.type === NODE_TYPE_ARCHIVE)
                jnode.li_attr.class += " archive-node";

            jnode.a_attr = {
                "class": node.has_notes? "has-notes": ""
            };

            if (node.todo_state) {
                jnode.a_attr.class += BookmarkTree._styleTODO(node);

                if (node._extended_todo) {
                    jnode.li_attr.class += " extended-todo";
                    jnode.text = BookmarkTree._formatTODO(node);
                }
            }

            if (node.type === NODE_TYPE_NOTES)
                jnode.li_attr.class += " scrapyard-notes";

            if (!node.icon) {
                if (node.type === NODE_TYPE_NOTES)
                    jnode.icon = "var(--themed-notes-icon)";
                else {
                    jnode.icon = "var(--themed-globe-icon)";
                    jnode.a_attr.class += " generic-icon";
                }
            }
        }

        return jnode;
    }

    set data(nodes) {
        this._jstree.settings.core.data = nodes;
    }

    get data() {
        return this._jstree.settings.core.data
    }

    get odata() {
        return this._jstree.settings.core.data.map(n => n.data);
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
        this.data = nodes.map(n => BookmarkTree.toJsTreeNode(n));

        let state;

        if (this._inline || everything) {
            this._everything = true;
            this._jstree.settings.state.key = TREE_STATE_PREFIX + EVERYTHING;
            state = JSON.parse(localStorage.getItem(TREE_STATE_PREFIX + EVERYTHING));
        }
        else {
            this._everything = false;
            let shelves = nodes.filter(n => n.type === NODE_TYPE_SHELF);

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

        this.data = nodes.map(n => BookmarkTree.toJsTreeNode(n));
        this.data.forEach(n => n.parent = "#");

        this._jstree.refresh(true);

        if (clearSelected)
            this._jstree.deselect_all(true);
    }

    renameRoot(name) {
        let root_node = this._jstree.get_node(this.odata.find(n => n.type === NODE_TYPE_SHELF));
        this._jstree.rename_node(root_node, name);
    }

    openRoot() {
        let root_node = this._jstree.get_node(this.odata.find(n => n.type === NODE_TYPE_SHELF));
        this._jstree.open_node(root_node);
        this._jstree.deselect_all(true);
    }

    setNotesState(nodeId, hasNotes) {
        let jnode = this._jstree.get_node(nodeId);

        if (jnode) {
            o(jnode).has_notes = hasNotes;
            jnode.a_attr.class = jnode.a_attr.class.replace("has-notes", "");

            if (hasNotes)
                jnode.a_attr.class += " has-notes";

            this._jstree.redraw_node(jnode, false, false, true);
        }
    }

    setNodeIcon(nodeId, icon) {
        let cloud_node = this._jstree.get_node(nodeId);

        if (cloud_node)
            this._jstree.set_icon(cloud_node, icon);
    }

    selectNode(nodeId, open, forceScroll) {
        let jnode = this._jstree.get_node(nodeId);
        this._jstree.deselect_all(true);
        this._jstree.select_node(nodeId);

        if (open)
            this._jstree.open_node(jnode);

        let domNode = document.getElementById(nodeId.toString());

        if (forceScroll) {
            domNode.scrollIntoView();
        }
        else {
            if (!isElementInViewport(domNode)) {
                domNode.scrollIntoView();
                $(this._element).scrollLeft(0);
            }
        }
    }

    async createNewGroupUnderSelection(id) {
        let selectedJnode = this.selected;
        let jnode = this._jstree.create_node(selectedJnode, {
            id: id,
            text: "New Folder",
            type: NODE_TYPE_GROUP,
            icon: "icons/group.svg",
            li_attr: {"class": "scrapyard-group"}
        });

        this._jstree.deselect_all();
        this._jstree.select_node(jnode);

        return new Promise((resolve, reject) => {
            this._jstree.edit(jnode, null, (jnode, success, cancelled) => {
                if (cancelled) {
                    this._jstree.delete_node(jnode);
                    resolve(null);
                }
                else {
                    backend.createGroup(parseInt(selectedJnode.id), jnode.text).then(group => {
                        if (group) {
                            this._jstree.set_id(jnode, group.id);
                            jnode.original = BookmarkTree.toJsTreeNode(group);
                            //BookmarkTree.reorderNodes(this._jstree, selectedJnode);
                            resolve(group);
                        }
                    });
                }
            });
        });
    }

    adjustBookmarkingTarget(nodeId) {
        let jnode = this._jstree.get_node(nodeId);
        let odata = this.odata;

        if (os(jnode)?.id === FIREFOX_SHELF_ID) {
            let unfiled = odata.find(n => n.external_id === FIREFOX_BOOKMARK_UNFILED)
            if (unfiled)
                jnode = this._jstree.get_node(unfiled.id);
            else
                jnode = this._jstree.get_node(odata.find(n => n.name === DEFAULT_SHELF_NAME).id);
        }

        return jnode;
    }

    static checkOperation(operation, node, parent, position, more) {
        // disable dnd copy
        if (operation === "copy_node") {
            return false;
        } else if (operation === "move_node") {
            if (more.ref && more.ref.id == FIREFOX_SHELF_ID
                || parent.id == FIREFOX_SHELF_ID || node.parent == FIREFOX_SHELF_ID)
                return false;

            if (o(node).external !== RDF_EXTERNAL_NAME && o(parent).external === RDF_EXTERNAL_NAME
                    || o(node).external === RDF_EXTERNAL_NAME
                    && more.ref && o(more.ref).external !== RDF_EXTERNAL_NAME)
                return false;
        }
        return true;
    }

    static moveNode(_, data) {
        let tree = this._jstree;
        let jparent = tree.get_node(data.parent);

        if (data.parent != data.old_parent) {
            let jnode = tree.get_node(data.node);

            if (this.startProcessingIndication)
                this.startProcessingIndication();

            browser.runtime.sendMessage({type: "MOVE_NODES", node_ids: [o(jnode).id], dest_id: o(jparent).id})
                .then(async new_nodes => { // keep jstree nodes synchronized with the database
                    for (let node of new_nodes) {
                        jnode.original = BookmarkTree.toJsTreeNode(node);

                        let old_original = this.data.find(d => d.id == node.id);
                        if (old_original)
                            this.data[this.data.indexOf(old_original)] = jnode.original;
                        else
                            this.data.push(jnode.original);
                    }
                    await BookmarkTree.reorderNodes(tree, jparent);

                    if (this.stopProcessingIndication)
                        this.stopProcessingIndication();
                }).catch(() => {
                    if (this.stopProcessingIndication)
                        this.stopProcessingIndication();
                });
        }
        else
            BookmarkTree.reorderNodes(tree, jparent);
    }

    static reorderNodes(tree, jparent) {
        let siblings = jparent.children.map(c => tree.get_node(c));

        let positions = [];
        for (let i = 0; i < siblings.length; ++i) {
            let node = {};
            node.id = o(siblings[i]).id;
            node.uuid = o(siblings[i]).uuid;
            node.external = o(siblings[i]).external;
            node.external_id = o(siblings[i]).external_id;
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

        function setTODOState(state) {
            let selected_ids = selectedNodes.map(n => o(n).type === NODE_TYPE_GROUP || o(n).type === NODE_TYPE_SHELF
                                                        ? n.children
                                                        : o(n).id);
            let todo_states = [];
            let marked_nodes = selected_ids.flat().map(id => tree.get_node(id));

            selected_ids = marked_nodes.filter(n => isEndpoint(o(n))).map(n => parseInt(n.id));

            selectedNodes = marked_nodes.filter(n => selected_ids.some(id => id === o(n).id)).map(n => o(n));

            selectedNodes.forEach(n => todo_states.push({id: n.id, uuid: n.uuid, external: n.external, todo_state: state}));

            backend.setTODOState(todo_states).then(() => {
                selected_ids.forEach(id => {
                    let jnode = tree.get_node(id);
                    o(jnode).todo_state = state;
                    jnode.a_attr.class = jnode.a_attr.class.replace(/todo-state-[a-zA-Z]+/g, "");
                    jnode.a_attr.class += BookmarkTree._styleTODO(o(jnode));
                    jnode.text = jnode.text.replace(/todo-state-[a-zA-Z]+/g, jnode.a_attr.class);
                    tree.redraw_node(jnode, true, false, true);
                });
            });
        }

        let containersSubmenu = {};

        for (let container of this._containers) {
            containersSubmenu[container.cookieStoreId] = {
                label: container.name,
                __container_id: container.cookieStoreId,
                _istyle: `mask-image: url("${container.iconUrl}"); mask-size: 16px 16px; `
                       + `mask-repeat: no-repeat; mask-position: center; background-color: ${container.colorCode};`,
                action: async function (obj) {
                    if (o(ctxNode).type === NODE_TYPE_SHELF || o(ctxNode).type === NODE_TYPE_GROUP) {
                        let children = self.odata.filter(n => ctxNode.children.some(id => id == n.id) && isEndpoint(n));
                        children = children.filter(c => c.type !== NODE_TYPE_NOTES);
                        children.forEach(c => c.type = NODE_TYPE_BOOKMARK);
                        children.sort((a, b) => a.pos - b.pos);

                        for (let node of children)
                            await browser.runtime.sendMessage({
                                type: "BROWSE_NODE", node, container: obj.item.__container_id
                            });
                    }
                    else {
                        for (let n of selectedNodes) {
                            let node = o(n);
                            if (!isEndpoint(node) || !node.uri)
                                continue;
                            node.type = NODE_TYPE_BOOKMARK;
                            await browser.runtime.sendMessage({
                                type: "BROWSE_NODE", node, container: obj.item.__container_id
                            });
                        }
                    }
                }
            }
        }

        let items = {
            openItem: {
                label: "Open",
                action: async function () {
                    for (let n of selectedNodes)
                        await browser.runtime.sendMessage({type: "BROWSE_NODE", node: o(n)});
                }
            },
            openAllItem: {
                label: "Open All",
                action: async function () {
                    let children = self.odata.filter(n => ctxNode.children.some(id => id == n.id) && isEndpoint(n));
                    children.sort((a, b) => a.pos - b.pos);

                    for (let node of children)
                        await browser.runtime.sendMessage({type: "BROWSE_NODE", node: node});
                }
            },
            openInContainerItem: {
                label: "Open in Container",
                submenu: containersSubmenu
            },
            sortItem: {
                label: "Sort by Name",
                action: function () {
                    let jchildren = ctxNode.children.map(c => tree.get_node(c));
                    jchildren.sort((a, b) => a.text.localeCompare(b.text));
                    ctxNode.children = jchildren.map(c => c.id);

                    tree.redraw_node(ctxNode, true, false, true);
                    BookmarkTree.reorderNodes(tree, ctxNode);
                }
            },
            openOriginalItem: {
                label: "Open Original URL",
                action: function () {
                    let url = o(ctxNode).uri;

                    if (url)
                        browser.tabs.create({
                            "url": url, cookieStoreId: o(ctxNode).container
                        });
                }
            },
            copyLinkItem: {
                label: "Copy Link",
                action: function () {
                    navigator.clipboard.writeText(o(ctxNode).uri);
                }
            },
            newFolderItem: {
                label: "New Folder",
                action: function () {
                    backend.createGroup(o(ctxNode).id, "New Folder").then(async group => {
                        let jgroup = BookmarkTree.toJsTreeNode(group);
                        tree.deselect_all(true);

                        let groupNode = tree.get_node(tree.create_node(ctxNode, jgroup, 0));
                        tree.select_node(groupNode);

                        await BookmarkTree.reorderNodes(tree, ctxNode);

                        tree.edit(groupNode, null, (jnode, success, cancelled) => {
                            if (success && !cancelled)
                                backend.renameGroup(group.id, jnode.text).then(group => {
                                    o(groupNode).name = groupNode.original.text = group.name;
                                    tree.rename_node(groupNode, group.name);
                                });
                        });
                    });
                }
            },
            newFolderAfterItem: {
                label: "New Folder After",
                action: function () {
                    let jparent = tree.get_node(ctxNode.parent);
                    let position = $.inArray(ctxNode.id, jparent.children);

                    backend.createGroup(o(jparent).id, "New Folder").then(async group => {
                        let jgroup = BookmarkTree.toJsTreeNode(group);
                        tree.deselect_all(true);

                        let groupNode = tree.get_node(tree.create_node(jparent, jgroup, position + 1));
                        tree.select_node(groupNode);

                        await BookmarkTree.reorderNodes(tree, jparent);

                        tree.edit(groupNode, null, (jnode, success, cancelled) => {
                            if (success && !cancelled)
                                backend.renameGroup(group.id, jnode.text).then(group => {
                                    o(groupNode).name = groupNode.original.text = group.name;
                                    tree.rename_node(groupNode, group.name);
                                });
                        });
                    });
                }
            },
            newSeparatorItem: {
                label: "New Separator",
                action: function () {
                    let jparent = tree.get_node(ctxNode.parent);

                    backend.addSeparator(o(jparent).id).then(separator => {
                            let position = $.inArray(ctxNode.id, jparent.children);
                            tree.create_node(jparent, BookmarkTree.toJsTreeNode(separator), position + 1);
                            BookmarkTree.reorderNodes(tree, jparent);
                        });
                }
            },
            newNotesItem: {
                label: "New Notes",
                action: () => {
                    backend.addNotes(o(ctxNode).id, "New Notes").then(notes => {
                        let jnotes = BookmarkTree.toJsTreeNode(notes);

                        self.data.push(jnotes);
                        tree.deselect_all(true);

                        let notesNode = tree.get_node(tree.create_node(ctxNode, jnotes));
                        tree.select_node(notesNode);

                        BookmarkTree.reorderNodes(tree, ctxNode);

                        tree.edit(notesNode, null, (jnode, success, cancelled) => {
                            if (success && !cancelled) {
                                notes.name = jnode.text;
                                backend.updateBookmark(notes).then(() => {
                                    o(jnode).name = jnode.original.text = jnode.text;
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
                        icon: (getThemeVar("--theme-background").trim() === "white"? "icons/cloud.png": "icons/cloud2.png"),
                        _disabled: !settings.cloud_enabled() || !cloudBackend.isAuthenticated(),
                        action: async function () {
                            self.startProcessingIndication();
                            let selectedIds = selectedNodes.map(n => o(n).id);
                            await browser.runtime.sendMessage({type: "SHARE_TO_CLOUD", node_ids: selectedIds})
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
                                    title: o(n).name,
                                    url: o(n).uri,
                                    tags: o(n).tags
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

                                if (o(node).type === NODE_TYPE_ARCHIVE) {
                                    let blob = await backend.fetchBlob(o(node).id);
                                    if (blob) {
                                        if (blob.byte_length) {
                                            blob.data = backend.blob2Array(blob);
                                        }

                                        let type = blob.type? blob.type: "text/html";
                                        filename = o(node).name
                                        if (!(filename.endsWith("pdf") || filename.endsWith("html")))
                                            filename = o(node).name + (type.endsWith("pdf")? ".pdf": ".html");
                                        content = new Blob([blob.data],{type: type});
                                    }
                                }
                                else if (o(node).type === NODE_TYPE_BOOKMARK) {
                                    filename = o(node).name + ".url";
                                    content = "[InternetShortcut]\nURL=" + o(node).uri;
                                }
                                else if (o(node).type === NODE_TYPE_NOTES) {
                                    let notes = await backend.fetchNotes(o(node).id);

                                    if (notes) {
                                        filename = o(node).name + ".org";
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
                separator_before: o(ctxNode).type === NODE_TYPE_SHELF || o(ctxNode).parent_id == FIREFOX_SHELF_ID,
                _disabled: !(tree.can_paste() && isContainer(o(ctxNode))),
                action: function () {
                    let buffer = tree.get_buffer();
                    let selection = Array.isArray(buffer.node)
                        ? buffer.node.map(n => o(n).id)
                        : [o(buffer.node).id];

                    if (self.startProcessingIndication)
                        self.startProcessingIndication();

                    (buffer.mode === "copy_node"
                        ? browser.runtime.sendMessage({type: "COPY_NODES", node_ids: selection, dest_id: o(ctxNode).id})
                        : browser.runtime.sendMessage({type: "MOVE_NODES", node_ids: selection, dest_id: o(ctxNode).id}))
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
                                let jparent = tree.get_node(n.parent_id);
                                let jnode = BookmarkTree.toJsTreeNode(n);
                                tree.create_node(jparent, jnode, "last");

                                let old_original = self.data.find(d => d.id == n.id);
                                if (old_original)
                                    self.data[self.data.indexOf(old_original)] = jnode;
                                else
                                    self.data.push(jnode);
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
                    browser.runtime.sendMessage({type: "BROWSE_NOTES", id: o(ctxNode).id, uuid: o(ctxNode).uuid});
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
                    let query = `?repairIcons=true&scope=${o(ctxNode).id}`
                    browser.tabs.create({url: `/options.html${query}#links`, active: true});
                }
            },
            deleteItem: {
                separator_before: true,
                label: "Delete",
                action: () => {
                    if (o(ctxNode).type === NODE_TYPE_SHELF) {
                        if (isSpecialShelf(o(ctxNode).name)) {
                            // TODO: i18n
                            showNotification({message: "A built-in shelf could not be deleted."});
                            return;
                        }

                        confirm("{Warning}", "Do you really want to delete '" + o(ctxNode).name + "'?")
                            .then(() => {
                                if (o(ctxNode).name) {

                                    if (self.startProcessingIndication)
                                        self.startProcessingIndication();

                                    browser.runtime.sendMessage({type: "DELETE_NODES", node_ids: o(ctxNode).id})
                                        .then(() => {
                                            if (self.stopProcessingIndication)
                                                self.stopProcessingIndication();

                                            tree.delete_node(ctxNode.id);

                                            if (this.onDeleteShelf)
                                                this.onDeleteShelf(o(ctxNode));
                                        }).catch(() => {
                                            if (self.stopProcessingIndication)
                                                self.stopProcessingIndication();
                                        });
                                }
                        });
                    }
                    else {
                        confirm("{Warning}", "{ConfirmDeleteItem}").then(() => {
                            let selected_ids = selectedNodes.map(n => o(n).id);

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
                    if (isEndpoint(o(ctxNode))) {

                        let properties = await backend.getNode(o(ctxNode).id);

                        properties.comments = await backend.fetchComments(properties.id);
                        let commentsPresent = !!properties.comments;

                        properties.containers = self._containers;

                        showDlg("properties", properties).then(async newProperties => {

                            delete properties.containers;

                            Object.assign(properties, newProperties);

                            if (!properties.icon) {
                                properties.icon = null;
                                properties.stored_icon = false;
                            }

                            self.startProcessingIndication();

                            properties.has_comments = !!properties.comments;

                            if (commentsPresent || properties.has_comments)
                                await backend.storeComments(properties.id, properties.comments);

                            delete properties.comments;

                            let live_data = self.data.find(n => n.id == properties.id);
                            Object.assign(o(ctxNode), properties);
                            Object.assign(live_data, BookmarkTree.toJsTreeNode(o(ctxNode)));

                            await backend.updateBookmark(properties);

                            self.stopProcessingIndication();

                            if (!o(ctxNode)._extended_todo)
                                tree.rename_node(ctxNode, properties.name);
                            else
                                tree.rename_node(ctxNode, BookmarkTree._formatTODO(o(ctxNode)));

                            tree.redraw_node(ctxNode, true, false, true);

                            $("#" + properties.id).prop('title', `${properties.name}\x0A${properties.uri}`);
                        });
                    }
                }
            },
            renameItem: {
                label: "Rename",
                action: () => {
                    switch (o(ctxNode).type) {
                        case NODE_TYPE_SHELF:
                            if (isSpecialShelf(o(ctxNode).name)) {
                                // TODO: i18n
                                showNotification({message: "A built-in shelf could not be renamed."});
                                return;
                            }

                            tree.edit(o(ctxNode).id, null, (jnode, success, cancelled) => {
                                if (success && !cancelled)
                                    backend.renameGroup(o(ctxNode).id, jnode.text).then(() => {
                                        o(ctxNode).name = ctxNode.original.text = jnode.text;
                                        tree.rename_node(jnode.id, jnode.text);

                                        if (self.onRenameShelf)
                                            self.onRenameShelf(o(ctxNode));
                                    });
                            });
                            break;
                        case NODE_TYPE_GROUP:
                            tree.edit(ctxNode, null, (node, success, cancelled) => {
                                if (success && !cancelled)
                                    backend.renameGroup(o(ctxNode).id, node.text).then(group => {
                                        o(ctxNode).name = ctxNode.original.text = group.name;
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
                    showDlg("prompt", {caption: "RDF Directory", label: "Path", title: o(ctxNode).uri})
                        .then(async data => {
                            let node = await backend.getNode(o(ctxNode).id);
                            o(ctxNode).uri = node.uri = data.title;
                            backend.updateNode(node);
                    });
                }
            }
        };


        switch (o(ctxNode).type) {
            case NODE_TYPE_SHELF:
                delete items.cutItem;
                delete items.copyItem;
                delete items.shareItem;
                delete items.newSeparatorItem;
                delete items.newFolderAfterItem;
                if (o(ctxNode).id === FIREFOX_SHELF_ID) {
                    items = {};
                }
                if (o(ctxNode).external !== RDF_EXTERNAL_NAME) {
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
                if (o(ctxNode).type === NODE_TYPE_GROUP)
                    delete items.rdfPathItem;
                if (o(ctxNode).external && o(ctxNode).external !== CLOUD_EXTERNAL_NAME)
                    delete items.newNotesItem;
                if (o(ctxNode).special_browser_folder) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.renameItem;
                    delete items.deleteItem;
                    delete items.newSeparatorItem;
                    delete items.newFolderAfterItem;
                }
                if (o(ctxNode).external === RDF_EXTERNAL_NAME) {
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
                if (o(ctxNode).external === RDF_EXTERNAL_NAME) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.pasteItem;
                    delete items.shareItem.submenu.dropboxItem;
                }
                break;
        }

        if (o(ctxNode).type === NODE_TYPE_SEPARATOR) {
            for (let k in items)
                if (!["deleteItem", "newFolderAfterItem"].find(s => s === k))
                    delete items[k];
        }

        if (o(ctxNode).type === NODE_TYPE_NOTES) {
            delete items.openInContainerItem;
        }

        if (!isEndpoint(o(ctxNode))) {
            delete items.viewNotesItem;
        }

        if (o(ctxNode)._extended_todo) {
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
