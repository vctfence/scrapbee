import {send} from "../proxy.js";
import {backend} from "../backend.js"
import {cloudBackend} from "../backend_cloud.js"

import {showDlg, confirm} from "./dialog.js"
import {settings} from "../settings.js";
import {
    isContainer,
    isEndpoint,
    isSpecialShelf,
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
    EVERYTHING_SHELF_ID,
    TODO_SHELF_ID,
    DONE_SHELF_ID,
    DEFAULT_SHELF_NAME
} from "../storage.js";
import {getThemeVar, isElementInViewport} from "../utils_html.js";
import {getActiveTab, openContainerTab, openPage, showNotification} from "../utils_browser.js";
import {IMAGE_FORMATS} from "../utils.js";
import {formatShelfName} from "../bookmarking.js";

export const TREE_STATE_PREFIX = "tree-state-";


// return the original Scrapyard node object stored in a jsTree node
let o = n => n.data;

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
                check_callback: BookmarkTree.checkOperation.bind(this),
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
                key: inline? TREE_STATE_PREFIX + EVERYTHING: undefined,
                _scrollable: inline
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
                if (o(jnode)?.stored_icon) {
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

                if (o(jnode)?.stored_icon) {
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
                        let element = await getIconElement();
                        if (element)
                            element.style.backgroundImage = fallback_icon;
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

            if (clickable && !e.ctrlKey && !e.shiftKey) {
                let node = o(this._jstree.get_node(element.id));
                if (node) {
                    if (settings.open_bookmark_in_active_tab()) {
                        getActiveTab().then(active_tab => {
                            active_tab = e.button === 0 && active_tab ? active_tab : undefined;
                            send.browseNode({node: node, tab: active_tab, preserveHistory: true});
                        });
                    }
                    else
                        send.browseNode({node: node});
                }
            }
            return false;
        }
    }

    traverse(root, visitor) {
        let _tree = this._jstree;
        function doTraverse(root) {
            if (!settings.show_firefox_toolbar() && o(root)?.external_id === FIREFOX_BOOKMARK_TOOLBAR
                || !settings.show_firefox_mobile() && o(root)?.external_id === FIREFOX_BOOKMARK_MOBILE
                || o(root)?.uuid === CLOUD_EXTERNAL_NAME)
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

    static _formatNodeTooltip(node) {
        return `${node.name}${node.uri? "\x0A" + node.uri: ""}`;
    }

    static _styleTODO(node) {
        if (node.todo_state)
            return " todo-state-" + (node.__overdue
                ? "overdue"
                : TODO_NAMES[node.todo_state].toLowerCase());

        return "";
    }

    static _formatTODO(node) {
        let text = "<div><span class='todo-path'>";

        for (let i = 0; i < node.__path.length; ++i) {
            text += node.__path[i];

            if (i !== node.__path.length - 1)
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
        jnode.text = node.name || "";
        jnode.type = node.type;
        jnode.icon = node.icon;
        jnode.data = node; // store the original Scrapyard node
        jnode.parent = node.parent_id;

        if (!jnode.parent)
            jnode.parent = "#";

        if (node.type === NODE_TYPE_SHELF && node.external === FIREFOX_SHELF_NAME) {
            jnode.text = formatShelfName(node.name);
            jnode.li_attr = {"class": "browser-logo"};
            jnode.icon = "/icons/firefox.svg";
            if (!settings.show_firefox_bookmarks()) {
                jnode.state = {hidden: true};
            }
            BookmarkTree.styleFirefoxFolders(node, jnode);
        }
        else if (node.type === NODE_TYPE_SHELF && node.external === CLOUD_EXTERNAL_NAME) {
            jnode.text = formatShelfName(node.name);
            jnode.li_attr = {"class": "cloud-shelf"};
            jnode.icon = "var(--themed-cloud-icon)";
        }
        else if (node.type === NODE_TYPE_SHELF && node.external === RDF_EXTERNAL_NAME) {
            jnode.li_attr = {"class": "rdf-archive"};
            jnode.icon = "/icons/tape.svg";
        }
        else if (node.type === NODE_TYPE_SHELF) {
            if (node.name && isSpecialShelf(node.name))
                jnode.text = formatShelfName(node.name);
            jnode.icon = "/icons/shelf.svg";
            jnode.li_attr = {"class": "scrapyard-shelf"};
        }
        else if (node.type === NODE_TYPE_GROUP) {
            jnode.icon = "/icons/group.svg";
            jnode.li_attr = {
                class: "scrapyard-group",
            };

            BookmarkTree.styleFirefoxFolders(node, jnode);
        }
        else if (node.type === NODE_TYPE_SEPARATOR) {
            jnode.text = "─".repeat(60);
            jnode.icon = false;
            jnode.a_attr = {
                class: "separator-node"
            };
        }
        else if (node.type !== NODE_TYPE_SHELF) {
            jnode.li_attr = {
                class: "show_tooltip",
                title: BookmarkTree._formatNodeTooltip(node),
                //"data-id": node.id,
                "data-clickable": "true"
            };

            if (node.type === NODE_TYPE_ARCHIVE)
                jnode.li_attr.class += " archive-node";

            jnode.a_attr = {
                class: node.has_notes? "has-notes": ""
            };

            if (node.todo_state) {
                jnode.a_attr.class += BookmarkTree._styleTODO(node);

                if (node.__extended_todo) {
                    jnode.li_attr.class += " extended-todo";
                    jnode.text = BookmarkTree._formatTODO(node);
                }
            }

            if (node.type === NODE_TYPE_NOTES)
                jnode.li_attr.class += " scrapyard-notes";

            if (!node.icon) {
                if (node.type === NODE_TYPE_NOTES)
                    jnode.icon = "var(--themed-notes-icon)";
                else if (node.content_type === "application/pdf")
                    jnode.icon = "var(--themed-pdf-icon)";
                else if (IMAGE_FORMATS.some(f => f === node.content_type))
                    jnode.icon = "var(--themed-image-icon)";
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
        return this._jstree.get_selected(true)
    }

    getSelectedNodes() {
        const selection = this._jstree.get_top_selected().map(id => parseInt(id));
        return this.odata.filter(n => selection.some(id => id === n.id));
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

    createTentativeNode(node) {
        node.__tentative = true;
        node.id = node.__tentative_id;
        let jnode = BookmarkTree.toJsTreeNode(node);

        jnode.a_attr.class += " node-pending";
        return this._jstree.create_node(node.parent_id, jnode, "last");
    }

    updateTentativeNode(node) {
        const jnode = this._jstree.get_node(node.__tentative_id);
        if (jnode) {
            this._jstree.set_id(node.__tentative_id, node.id);
            const jnode = this._jstree.get_node(node.id);

            jnode.a_attr.class = jnode.a_attr.class.replace("node-pending", " ");

            node.__tentative = false;

            Object.assign(o(jnode), node);
            jnode.original = BookmarkTree.toJsTreeNode(node);
            this.data.push(jnode.original);

            if (node.icon && node.stored_icon) {
                this.iconCache.set(node.icon, jnode.icon);
                jnode.icon = node.icon;
            }
            else
                jnode.icon = jnode.original.icon;

            this._jstree.redraw_node(jnode)
        }
    }

    openNode(nodeId) {
        let jnode = this._jstree.get_node(nodeId);
        this._jstree.open_node(jnode);
    }

    selectNode(nodeId, open, forceScroll) {
        this._jstree.deselect_all(true);
        this._jstree.select_node(nodeId);

        if (Array.isArray(nodeId))
            nodeId = nodeId[0];

        if (open)
            this._jstree.open_node(nodeId);

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
        let selectedJNode = this.selected?.[0];

        if (!selectedJNode)
            return;

        let jnode = this._jstree.create_node(selectedJNode, {
            id: id,
            text: "New Folder",
            type: NODE_TYPE_GROUP,
            icon: "/icons/group.svg",
            li_attr: {"class": "scrapyard-group"}
        });

        this._jstree.deselect_all();
        this._jstree.select_node(jnode);

        return new Promise((resolve, reject) => {
            this._jstree.edit(jnode, null, async (jnode, success, cancelled) => {
                if (cancelled) {
                    this._jstree.delete_node(jnode);
                    resolve(null);
                }
                else {
                    const group = send.createGroup({parent: parseInt(selectedJNode.id), name: jnode.text});
                    if (group) {
                        this._jstree.set_id(jnode, group.id);
                        jnode.original = BookmarkTree.toJsTreeNode(group);
                        //this.reorderNodes(selectedJNode);
                        resolve(group);
                    }
                }
            });
        });
    }

    adjustBookmarkingTarget(nodeId) {
        let jnode = this._jstree.get_node(nodeId);
        let odata = this.odata;

        if (o(jnode)?.id === FIREFOX_SHELF_ID) {
            let unfiled = odata.find(n => n.external_id === FIREFOX_BOOKMARK_UNFILED)
            if (unfiled)
                jnode = this._jstree.get_node(unfiled.id);
            else
                jnode = this._jstree.get_node(odata.find(n => n.name === DEFAULT_SHELF_NAME).id);
        }

        return jnode;
    }

    static checkOperation(operation, jnode, jparent, position, more) {
        // disable dnd copy
        if (operation === "copy_node") {
            return false;
        } else if (operation === "move_node") {
            if (more.ref && more.ref.id == FIREFOX_SHELF_ID
                    || jparent.id == FIREFOX_SHELF_ID || jnode.parent == FIREFOX_SHELF_ID)
                return false;

            if (o(jnode)?.external !== RDF_EXTERNAL_NAME && o(jparent)?.external === RDF_EXTERNAL_NAME
                    || o(jnode)?.external === RDF_EXTERNAL_NAME
                        && more.ref && o(more.ref)?.external !== RDF_EXTERNAL_NAME)
                return false;
        }

        return true;
    }

    static async moveNode(_, data) {
        let tree = this._jstree;
        let jparent = tree.get_node(data.parent);

        if (data.parent != data.old_parent) {
            let jnode = tree.get_node(data.node);

            this.startProcessingIndication();

            try {
                const newNodes = await send.moveNodes({node_ids: [o(jnode).id], dest_id: o(jparent).id});
                // keep jstree nodes synchronized with the database
                for (let node of newNodes) {
                    jnode.original = BookmarkTree.toJsTreeNode(node);

                    let old_original = this.data.find(d => d.id == node.id);
                    if (old_original)
                        this.data[this.data.indexOf(old_original)] = jnode.original;
                    else
                        this.data.push(jnode.original);
                }
                await this.reorderNodes(jparent);
            }
            finally {
                this.stopProcessingIndication();
            }
        }
        else
            this.reorderNodes(jparent);
    }

    reorderNodes(jparent) {
        let siblings = jparent.children.map(c => this._jstree.get_node(c));

        let positions = [];
        for (let i = 0; i < siblings.length; ++i) {
            const node = {};
            const sibling = o(siblings[i]);
            node.id = sibling.id;
            node.uuid = sibling.uuid;
            node.external = sibling.external;
            node.external_id = sibling.external_id;
            node.pos = i;
            positions.push(node);
        }

        return send.reorderNodes({positions: positions});
    }

    /* context menu listener */
    contextMenu(ctxNode) { // TODO: i18n
        if (o(ctxNode).__tentative)
            return null;

        let tree = this._jstree;
        let selectedNodes = tree.get_selected(true) || [];
        let multiselect = selectedNodes.length > 1;

        const setTODOState = async state => {
            let selected_ids = selectedNodes.map(n => o(n).type === NODE_TYPE_GROUP || o(n).type === NODE_TYPE_SHELF
                                                        ? n.children
                                                        : o(n).id);
            let nodes = [];
            let marked_nodes = selected_ids.flat().map(id => tree.get_node(id));

            selected_ids = marked_nodes.filter(n => isEndpoint(o(n))).map(n => parseInt(n.id));

            selectedNodes = marked_nodes.filter(n => selected_ids.some(id => id === o(n).id)).map(n => o(n));

            selectedNodes.forEach(n => nodes.push({id: n.id, uuid: n.uuid, external: n.external, todo_state: state}));

            this.startProcessingIndication();

            await send.setTODOState({nodes});

            this.stopProcessingIndication();

            selected_ids.forEach(id => {
                let jnode = tree.get_node(id);
                o(jnode).todo_state = state;
                jnode.a_attr.class = jnode.a_attr.class.replace(/todo-state-[a-zA-Z]+/g, "");
                jnode.a_attr.class += BookmarkTree._styleTODO(o(jnode));
                jnode.text = jnode.text.replace(/todo-state-[a-zA-Z]+/g, jnode.a_attr.class);
                tree.redraw_node(jnode, true, false, true);
            });
        }

        let containersSubmenu = {};

        for (let container of this._containers) {
            containersSubmenu[container.cookieStoreId] = {
                label: container.name,
                __container_id: container.cookieStoreId,
                _istyle: `mask-image: url("${container.iconUrl}"); mask-size: 16px 16px; `
                       + `mask-repeat: no-repeat; mask-position: center; background-color: ${container.colorCode};`,
                action: async obj => {
                    if (o(ctxNode).type === NODE_TYPE_SHELF || o(ctxNode).type === NODE_TYPE_GROUP) {
                        let children = this.odata.filter(n => ctxNode.children.some(id => id == n.id) && isEndpoint(n));
                        children = children.filter(c => c.type !== NODE_TYPE_NOTES);
                        children.forEach(c => c.type = NODE_TYPE_BOOKMARK);
                        children.sort((a, b) => a.pos - b.pos);

                        for (let node of children) {
                            delete node.tag_list;
                            await send.browseNode({node, container: obj.item.__container_id});
                        }
                    }
                    else {
                        for (let n of selectedNodes) {
                            let node = o(n);
                            if (!isEndpoint(node) || !node.uri)
                                continue;
                            node.type = NODE_TYPE_BOOKMARK;
                            await send.browseNode({node, container: obj.item.__container_id});
                        }
                    }
                }
            }
        }

        let items = {
            locateItem: {
                label: "Locate",
                action: async () => {
                    this.sidebarSelectNode(o(ctxNode));
                }
            },
            openItem: {
                label: "Open",
                separator_before: o(ctxNode).__filtering,
                action: async () => {
                    for (let jnode of selectedNodes)
                        await send.browseNode({node: o(jnode)});
                }
            },
            openAllItem: {
                label: "Open All",
                action: async () => {
                    let children = this.odata.filter(n => ctxNode.children.some(id => id == n.id) && isEndpoint(n));
                    children.sort((a, b) => a.pos - b.pos);

                    for (let node of children) {
                        delete node.tag_list;
                        await send.browseNode({node: node});
                    }
                }
            },
            openOriginalItem: {
                label: "Open Original URL",
                action: async () => {
                    let url = o(ctxNode).uri;

                    if (url)
                        openContainerTab(url, o(ctxNode).container);
                }
            },
            openInContainerItem: {
                label: "Open in Container",
                submenu: containersSubmenu
            },
            sortItem: {
                label: "Sort by Name",
                action: () => {
                    let jchildren = ctxNode.children.map(c => tree.get_node(c));
                    jchildren.sort((a, b) => a.text.localeCompare(b.text));
                    ctxNode.children = jchildren.map(c => c.id);

                    tree.redraw_node(ctxNode, true, false, true);
                    this.reorderNodes(ctxNode);
                }
            },
            copyLinkItem: {
                label: "Copy Link",
                action: () => navigator.clipboard.writeText(o(ctxNode).uri)
            },
            newFolderItem: {
                label: "New Folder",
                action: async () => {
                    let group = {id: backend.setTentativeId({}), type: NODE_TYPE_GROUP, name: "New Folder",
                                 parent_id: o(ctxNode).id};
                    const groupPending = send.createGroup({parent: o(ctxNode), name: group.name});

                    let jgroup = BookmarkTree.toJsTreeNode(group);
                    tree.deselect_all(true);

                    let groupJNode = tree.get_node(tree.create_node(ctxNode, jgroup, 0));
                    tree.select_node(groupJNode);

                    tree.edit(groupJNode, null, async (jnode, success, cancelled) => {
                        this.startProcessingIndication();
                        group = await groupPending;
                        tree.set_id(groupJNode.id, group.id);

                        if (success && !cancelled && jnode.text) {
                            group = await send.renameGroup({id: group.id, name: jnode.text});

                            tree.rename_node(jnode, group.name);
                            Object.assign(o(jnode), group);
                            jnode.original = BookmarkTree.toJsTreeNode(group);
                            await this.reorderNodes(ctxNode);
                        }
                        else {
                            tree.rename_node(jnode, group.name);
                            Object.assign(o(jnode), group);
                            jnode.original = BookmarkTree.toJsTreeNode(group);
                            await this.reorderNodes(ctxNode);
                        }

                        this.stopProcessingIndication();
                    });
                }
            },
            newFolderAfterItem: {
                label: "New Folder After",
                action: async () => {
                    let jparent = tree.get_node(ctxNode.parent);
                    let position = $.inArray(ctxNode.id, jparent.children);

                    let group = {id: backend.setTentativeId({}), type: NODE_TYPE_GROUP, name: "New Folder",
                        parent_id: o(jparent).id};
                    const groupPending = send.createGroup({parent: o(jparent), name: group.name});

                    let jgroup = BookmarkTree.toJsTreeNode(group);
                    tree.deselect_all(true);

                    let groupJNode = tree.get_node(tree.create_node(jparent, jgroup, position + 1));
                    tree.select_node(groupJNode);

                    tree.edit(groupJNode, null, async (jnode, success, cancelled) => {
                        this.startProcessingIndication();
                        group = await groupPending;
                        tree.set_id(groupJNode.id, group.id);

                        if (success && !cancelled && jnode.text) {
                            group = await send.renameGroup({id: group.id, name: jnode.text});

                            tree.rename_node(jnode, group.name);
                            Object.assign(o(jnode), group);
                            jnode.original = BookmarkTree.toJsTreeNode(group);
                            await this.reorderNodes(jparent);
                        }
                        else {
                            tree.rename_node(jnode, group.name);
                            Object.assign(o(jnode), group);
                            jnode.original = BookmarkTree.toJsTreeNode(group);
                            await this.reorderNodes(jparent);
                        }

                        this.stopProcessingIndication();
                    });
                }
            },
            newSeparatorItem: {
                label: "New Separator",
                action: async () => {
                    let jparent = tree.get_node(ctxNode.parent);

                    const separator = await send.addSeparator({parent_id: o(jparent).id});

                    let position = $.inArray(ctxNode.id, jparent.children);
                    tree.create_node(jparent, BookmarkTree.toJsTreeNode(separator), position + 1);
                    this.reorderNodes(jparent);
                }
            },
            newNotesItem: {
                label: "New Notes",
                action: async () => {
                    this.startProcessingIndication();
                    let notes = await send.addNotes({parent_id: o(ctxNode).id, name: "New Notes"});
                    this.stopProcessingIndication();

                    let jnotes = BookmarkTree.toJsTreeNode(notes);

                    this.data.push(jnotes);
                    tree.deselect_all(true);

                    let notesNode = tree.get_node(tree.create_node(ctxNode, jnotes));
                    tree.select_node(notesNode);

                    tree.edit(notesNode, null, async (jnode, success, cancelled) => {
                        this.startProcessingIndication();

                        if (success && !cancelled && jnode.text) {
                            notes.name = jnode.text;
                            notes = await send.updateBookmark({node: notes});
                            await this.reorderNodes(ctxNode);

                            o(jnode).name = jnode.original.text = jnode.text;
                            //tree.rename_node(notesNode, notes.name);
                        }
                        else
                            await this.reorderNodes(ctxNode);

                        this.stopProcessingIndication();
                    });
                }
            },
            shareItem: {
                separator_before: true,
                label: "Share",
                submenu: {
                    cloudItem: {
                        label: "Cloud",
                        icon: (getThemeVar("--theme-background").trim() === "white"? "/icons/cloud.png": "/icons/cloud2.png"),
                        _disabled: !settings.cloud_enabled() || !cloudBackend.isAuthenticated(),
                        action: async () => {
                            this.startProcessingIndication(true);
                            let selectedIds = selectedNodes.map(n => o(n).id);
                            try {
                                await send.shareToCloud({node_ids: selectedIds})
                            }
                            finally {
                                this.stopProcessingIndication();
                            }
                        }
                    },
                    pocketItem: {
                        label: "Pocket",
                        icon: "/icons/pocket.svg",
                        action: async () => {
                            if (selectedNodes)
                                await send.shareToPocket({nodes: selectedNodes.map(n => o(n))});
                        }
                    },
                    dropboxItem: {
                        label: "Dropbox",
                        icon: "/icons/dropbox.png",
                        action: async () => {
                            if (selectedNodes)
                                await send.shareToDropbox({nodes: selectedNodes.map(n => o(n))});
                        }
                    }
                }
            },
            cutItem: {
                separator_before: true,
                label: "Cut",
                action: () => tree.cut(selectedNodes)
            },
            copyItem: {
                label: "Copy",
                action: () => tree.copy(selectedNodes)
            },
            pasteItem: {
                label: "Paste",
                separator_before: o(ctxNode).type === NODE_TYPE_SHELF || o(ctxNode).parent_id == FIREFOX_SHELF_ID,
                _disabled: !(tree.can_paste() && isContainer(o(ctxNode))),
                action: async () => {
                    let buffer = tree.get_buffer();
                    let selection = Array.isArray(buffer.node)? buffer.node.map(n => o(n)): [o(buffer.node)];
                    selection.sort((a, b) => a.pos - b.pos);
                    selection = selection.map(n => n.id);

                    this.startProcessingIndication();

                    try {
                        let new_nodes;
                        if (buffer.mode === "copy_node")
                            new_nodes = await send.copyNodes({node_ids: selection, dest_id: o(ctxNode).id});
                        else {
                            new_nodes = await send.moveNodes({node_ids: selection, dest_id: o(ctxNode).id});
                            for (let s of selection)
                                tree.delete_node(s);
                        }

                        for (let n of new_nodes) {
                            let jparent = tree.get_node(n.parent_id);
                            let jnode = BookmarkTree.toJsTreeNode(n);
                            tree.create_node(jparent, jnode, "last");

                            let old_original = this.data.find(d => d.id == n.id);
                            if (old_original)
                                this.data[this.data.indexOf(old_original)] = jnode;
                            else
                                this.data.push(jnode);
                        }

                        await this.reorderNodes(ctxNode);
                        tree.clear_buffer();
                    }
                    finally {
                        this.stopProcessingIndication();
                    }
                }
            },
            viewNotesItem: {
                separator_before: true,
                label: "Open Notes",
                action: () => {
                    send.browseNotes({id: o(ctxNode).id, uuid: o(ctxNode).uuid});
                }
            },
            todoItem: {
                separator_before: true,
                label: "TODO",
                submenu: {
                    todoItem: {
                        label: "TODO",
                        icon: "/icons/todo.svg",
                        action: () => {
                            setTODOState(TODO_STATE_TODO);
                        }
                    },
                    waitingItem: {
                        label: "WAITING",
                        icon: "/icons/waiting.svg",
                        action: () => {
                            setTODOState(TODO_STATE_WAITING);
                        }
                    },
                    postponedItem: {
                        label: "POSTPONED",
                        icon: "/icons/postponed.svg",
                        action: () => {
                            setTODOState(TODO_STATE_POSTPONED);
                        }
                    },
                    cancelledItem: {
                        label: "CANCELLED",
                        icon: "/icons/cancelled.svg",
                        action: () => {
                            setTODOState(TODO_STATE_CANCELLED);
                        }
                    },
                    doneItem: {
                        label: "DONE",
                        icon: "/icons/done.svg",
                        action: () => {
                            setTODOState(TODO_STATE_DONE);
                        }
                    },
                    clearItem: {
                        separator_before: true,
                        label: "Clear",
                        action: () => {
                            setTODOState(null);
                        }
                    }
                }
            },
            checkLinksItem: {
                separator_before: true,
                label: "Check Links...",
                action: async () => {
                    await settings.load();
                    let query = `?menu=true&repairIcons=${settings.repair_icons()}&scope=${o(ctxNode).id}`;
                    openPage(`options.html${query}#links`);
                }
            },
            uploadItem: {
                label: "Upload...",
                action: () => {
                    send.uploadFiles({parent_id: o(ctxNode).id})
                }
            },
            deleteItem: {
                separator_before: true,
                label: "Delete",
                action: async () => {
                    if (o(ctxNode).type === NODE_TYPE_SHELF) {
                        if (isSpecialShelf(o(ctxNode).name)) {
                            // TODO: i18n
                            showNotification({message: "A built-in shelf could not be deleted."});
                            return;
                        }

                        if (await confirm("{Warning}", "{ConfirmDeleteItem}")) {
                            this.startProcessingIndication();

                            let selectedIds = selectedNodes.map(n => o(n).id);

                            try {
                                await send.deleteNodes({node_ids: selectedIds});

                                tree.delete_node(selectedNodes);
                                this.onDeleteShelf(selectedIds);
                            }
                            finally {
                                this.stopProcessingIndication();
                            }
                        }
                    }
                    else {
                        if (await confirm("{Warning}", "{ConfirmDeleteItem}")) {
                            this.startProcessingIndication();

                            try {
                                await send.deleteNodes({node_ids: selectedNodes.map(n => o(n).id)});
                                tree.delete_node(selectedNodes);
                            }
                            finally {
                                this.stopProcessingIndication();
                            }
                        }
                    }
                }
            },
            propertiesItem: {
                separator_before: true,
                label: "Properties...",
                action: async () => {
                    if (isEndpoint(o(ctxNode))) {
                        let properties = await backend.getNode(o(ctxNode).id);

                        properties.comments = await backend.fetchComments(properties.id);
                        let commentsPresent = !!properties.comments;

                        properties.containers = this._containers;

                        let newProperties = await showDlg("properties", properties);

                        if (newProperties) {

                            delete properties.containers;

                            Object.assign(properties, newProperties);

                            if (!properties.icon) {
                                properties.icon = undefined;
                                properties.stored_icon = undefined;
                            }

                            this.startProcessingIndication();

                            properties.has_comments = !!properties.comments;

                            if (commentsPresent || properties.has_comments)
                                await backend.storeComments(properties.id, properties.comments);

                            delete properties.comments;

                            backend.cleanBookmark(properties);

                            properties = await send.updateBookmark({node: properties});

                            this.stopProcessingIndication();

                            let live_data = this.data.find(n => n.id == properties.id);
                            Object.assign(o(ctxNode), properties);
                            Object.assign(live_data, BookmarkTree.toJsTreeNode(o(ctxNode)));

                            if (!o(ctxNode).__extended_todo)
                                tree.rename_node(ctxNode, properties.name);
                            else
                                tree.rename_node(ctxNode, BookmarkTree._formatTODO(o(ctxNode)));

                            tree.redraw_node(ctxNode, true, false, true);

                            $("#" + properties.id).prop('title', BookmarkTree._formatNodeTooltip(properties));
                        }
                    }
                }
            },
            renameItem: {
                label: "Rename",
                action: async () => {
                    const node = o(ctxNode);
                    switch (node.type) {
                        case NODE_TYPE_SHELF:
                            if (isSpecialShelf(node.name)) {
                                showNotification({message: "A built-in shelf could not be renamed."});
                                return;
                            }

                            tree.edit(node.id, null, async (jnode, success, cancelled) => {
                                if (success && !cancelled) {
                                    this.startProcessingIndication();
                                    await send.renameGroup({id: node.id, name: jnode.text})
                                    this.stopProcessingIndication();
                                    node.name = ctxNode.original.text = jnode.text;
                                    tree.rename_node(jnode.id, jnode.text);
                                    this.onRenameShelf(node);
                                }
                            });
                            break;
                        case NODE_TYPE_GROUP:
                            tree.edit(ctxNode, null, async (jnode, success, cancelled) => {
                                if (success && !cancelled) {
                                    this.startProcessingIndication();
                                    const group = await send.renameGroup({id: node.id, name: jnode.text});
                                    this.stopProcessingIndication();
                                    node.name = ctxNode.original.text = group.name;
                                    tree.rename_node(ctxNode, group.name);
                                }
                            });
                            break;
                    }
                }
            },
            rdfPathItem: {
                separator_before: true,
                label: "RDF Directory...",
                action: async () => {
                    const options = await showDlg("prompt", {caption: "RDF Directory", label: "Path",
                                                                        title: o(ctxNode).uri});
                    if (options) {
                        let node = await backend.getNode(o(ctxNode).id);
                        o(ctxNode).uri = node.uri = options.title;
                        backend.updateNode(node);
                    }
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
                delete items.checkLinksItem;
                delete items.uploadItem;
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

        if (o(ctxNode).__extended_todo) {
            delete items.newSeparatorItem;
            delete items.newFolderAfterItem;
        }

        if (!o(ctxNode).__filtering) {
            delete items.locateItem;
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
