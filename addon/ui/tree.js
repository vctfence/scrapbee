import {send} from "../proxy.js";
import {cloudBackend} from "../backend_cloud_shelf.js"
import {showDlg, confirm} from "./dialog.js"
import {settings} from "../settings.js";
import {
    isContainer,
    isEndpoint,
    isBuiltInShelf,
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
    DEFAULT_SHELF_NAME, byPosition, BROWSER_EXTERNAL_NAME
} from "../storage.js";
import {getThemeVar, isElementInViewport} from "../utils_html.js";
import {getActiveTab, openContainerTab, openPage, showNotification} from "../utils_browser.js";
import {IMAGE_FORMATS} from "../utils.js";
import {formatShelfName} from "../bookmarking.js";
import {Bookmark} from "../bookmarks_bookmark.js";
import {Comments, Icon, Node} from "../storage_entities.js";

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
                if (o(jnode)?.stored_icon) {
                    const cached = this.iconCache.get(jnode.icon);
                    const base64Url = cached || (await Icon.get(o(jnode).id));

                    if (base64Url) {
                        if (!cached)
                            this.iconCache.set(jnode.icon, base64Url);
                        let iconElement = await this._getIconElement(a_element);
                        if (iconElement)
                            iconElement.style.backgroundImage = `url("${base64Url}")`;
                    }
                }
                else {
                    let image = new Image();

                    image.onerror = async e => {
                        const fallback_icon = "var(--themed-globe-icon)";
                        jnode.icon = fallback_icon;
                        let iconElement = await this._getIconElement(a_element);
                        if (iconElement)
                            iconElement.style.backgroundImage = fallback_icon;
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

    _getIconElement(a_element) {
        const a_element2 = document.getElementById(a_element.id);
        if (a_element2)
            return a_element2.childNodes[0];
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

            if (element.classList.contains("jstree-ocl")) // expand/collapse arrow icon
                return;

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

            let node = o(this._jstree.get_node(element.id));
            let clickable = element.getAttribute("data-clickable") || node.__filtering;

            if (clickable && !e.ctrlKey && !e.shiftKey) {
                if (node) {
                    if (settings.open_bookmark_in_active_tab()) {
                        getActiveTab().then(activeTab => {
                            activeTab = e.button === 0 && activeTab ? activeTab : undefined;
                            send.browseNode({node: node, tab: activeTab, preserveHistory: true});
                        });
                    }
                    else
                        send.browseNode({node: node});
                }
            }
            return false;
        }
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
        if (node.external === BROWSER_EXTERNAL_NAME && node.external_id === FIREFOX_BOOKMARK_MENU) {
            jnode.icon = "/icons/bookmarksMenu.svg";
            jnode.li_attr = {"class": "browser-bookmark-menu"};
            node.special_browser_folder = true;
        }
        else if (node.external === BROWSER_EXTERNAL_NAME && node.external_id === FIREFOX_BOOKMARK_UNFILED) {
            jnode.icon = "/icons/unfiledBookmarks.svg";
            jnode.li_attr = {"class": "browser-unfiled-bookmarks"};
            node.special_browser_folder = true;
        }
        else if (node.external === BROWSER_EXTERNAL_NAME && node.external_id === FIREFOX_BOOKMARK_TOOLBAR) {
            jnode.icon = "/icons/bookmarksToolbar.svg";
            jnode.li_attr = {"class": "browser-bookmark-toolbar"};
            if (!settings.show_firefox_toolbar())
                jnode.state = {hidden: true};
            node.special_browser_folder = true;
        }
        else if (node.external === BROWSER_EXTERNAL_NAME && node.external_id === FIREFOX_BOOKMARK_MOBILE) {
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

        if (node.type === NODE_TYPE_SHELF && node.external === BROWSER_EXTERNAL_NAME) {
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
            if (node.name && isBuiltInShelf(node.name))
                jnode.text = formatShelfName(node.name);
            jnode.icon = "/icons/shelf.svg";
            jnode.li_attr = {"class": "scrapyard-shelf"};
        }
        else if (node.type === NODE_TYPE_GROUP) {
            jnode.icon = "/icons/group.svg";
            jnode.li_attr = {
                class: "scrapyard-group",
            };

            if (node.site) {
                jnode.li_attr["data-clickable"] = "true";
                jnode.li_attr["class"] += " scrapyard-site"
                jnode.icon = "/icons/web.svg";
            }

            BookmarkTree.styleFirefoxFolders(node, jnode);
        }
        else if (node.type === NODE_TYPE_SEPARATOR) {
            jnode.text = "─".repeat(60);
            jnode.icon = false;
            jnode.a_attr = {
                class: "separator-node"
            };
        }
        else {
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
    list(nodes, stateKey, clearSelected = false) {
        if (stateKey)
            this.stateKey = TREE_STATE_PREFIX + stateKey;

        this.data = nodes.map(n => BookmarkTree.toJsTreeNode(n));
        this.data.forEach(n => n.parent = "#");

        this._jstree.refresh(true);

        if (clearSelected)
            this._jstree.deselect_all(true);
    }

    renameRoot(name) {
        let rootNode = this._jstree.get_node(this.odata.find(n => n.type === NODE_TYPE_SHELF));
        this._jstree.rename_node(rootNode, name);
    }

    openRoot() {
        let rootNode = this._jstree.get_node(this.odata.find(n => n.type === NODE_TYPE_SHELF));
        this._jstree.open_node(rootNode);
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
        let cloudNode = this._jstree.get_node(nodeId);

        if (cloudNode)
            this._jstree.set_icon(cloudNode, icon);
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

            return true;
        }
        return false;
    }

    removeTentativeNode(node) {
        this._jstree.delete_node(node.__tentative_id);
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
            $(this._element).scrollLeft(0);
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
                    const group = await send.createGroup({parent: parseInt(selectedJNode.id), name: jnode.text});
                    if (group) {
                        this._jstree.set_id(jnode.id, group.id);
                        jnode.original = BookmarkTree.toJsTreeNode(group);
                        this._jstree.rename_node(jnode, group.name);
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

                    let oldOriginal = this.data.find(d => d.id == node.id);
                    if (oldOriginal)
                        this.data[this.data.indexOf(oldOriginal)] = jnode.original;
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
        let jsiblings = jparent.children.map(c => this._jstree.get_node(c));
        // optimization may produce unexpected results in Sync
        let optimized = false; //!jsiblings.some(jn => o(jn).external === RDF_EXTERNAL_NAME);

        let positions = [];
        for (let i = 0; i < jsiblings.length; ++i) {
            const sibling = o(jsiblings[i]);
            // if (sibling.pos === i && optimized)
            //     continue;

            const orderNode = {};
            orderNode.id = sibling.id;
            orderNode.uuid = sibling.uuid;
            orderNode.parent_id = sibling.parent_id;
            orderNode.external = sibling.external;
            orderNode.external_id = sibling.external_id;
            sibling.pos = orderNode.pos = i;
            positions.push(orderNode);
        }

        return send.reorderNodes({positions: positions});
    }

    contextMenu(ctxJNode) {
        const ctxNode = o(ctxJNode);

        if (ctxNode.__tentative)
            return null;

        const tree = this._jstree;
        const lightTheme = getThemeVar("--theme-background").trim() === "white";

        let selectedNodes = tree.get_selected(true) || [];
        const multiselect = selectedNodes.length > 1;

        const setTODOState = async state => {
            let selectedIds = selectedNodes.map(n => o(n).type === NODE_TYPE_GROUP || o(n).type === NODE_TYPE_SHELF
                                                        ? n.children
                                                        : o(n).id);
            let nodes = [];
            let changedNodes = selectedIds.flat().map(id => tree.get_node(id));

            selectedIds = changedNodes.filter(n => isEndpoint(o(n))).map(n => parseInt(n.id));

            selectedNodes = changedNodes.filter(n => selectedIds.some(id => id === o(n).id)).map(n => o(n));

            // a minimal set of attributes compatible with marshalling
            selectedNodes.forEach(n => nodes.push({id: n.id, parent_id: n.parent_id, name: n.name, uuid: n.uuid,
                external: n.external, todo_state: state}));

            this.startProcessingIndication();

            await send.setTODOState({nodes});

            this.stopProcessingIndication();

            selectedIds.forEach(id => {
                let jnode = tree.get_node(id);
                o(jnode).todo_state = state;
                jnode.a_attr.class = jnode.a_attr.class.replace(/todo-state-[a-zA-Z]+/g, "");
                jnode.a_attr.class += BookmarkTree._styleTODO(o(jnode));
                jnode.text = jnode.text.replace(/todo-state-[a-zA-Z]+/g, jnode.a_attr.class);
                tree.redraw_node(jnode, true, false, true);
            });
        }

        let containers =
            ctxNode.type === NODE_TYPE_BOOKMARK
                ? [/*{cookieStoreId: undefined, name: "Default", iconUrl: "../icons/containers.svg",
                           colorCode: (lightTheme? "#666666": "#8C8C90") },*/ ...this._containers]
                : this._containers;

        let containersSubmenu = {};

        for (let container of containers) {
            containersSubmenu[container.cookieStoreId] = {
                label: container.name,
                __container_id: container.cookieStoreId,
                _istyle: `mask-image: url("${container.iconUrl}"); mask-size: 16px 16px; `
                       + `mask-repeat: no-repeat; mask-position: center; background-color: ${container.colorCode};`,
                action: async obj => {
                    if (ctxNode.type === NODE_TYPE_SHELF || ctxNode.type === NODE_TYPE_GROUP) {
                        let children = this.odata.filter(n => ctxJNode.children.some(id => id == n.id) && isEndpoint(n));
                        children = children.filter(c => c.type !== NODE_TYPE_NOTES);
                        children.forEach(c => c.type = NODE_TYPE_BOOKMARK);
                        children.sort(byPosition);

                        for (let node of children) {
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
                    this.sidebarSelectNode(ctxNode);
                }
            },
            archiveItem: {
                label: "Archive",
                separator_before: ctxNode.__filtering,
                action: async () => {
                    send.archiveBookmarks({nodes: selectedNodes.map(n => o(n))});
                }
            },
            copyLinkItem: {
                label: "Copy Link",
                separator_before: ctxNode.__filtering && ctxNode.type !== NODE_TYPE_BOOKMARK,
                action: () => navigator.clipboard.writeText(ctxNode.uri)
            },
            openItem: {
                label: "Open",
                separator_before: ctxNode.__filtering,
                action: async () => {
                    for (let jnode of selectedNodes)
                        await send.browseNode({node: o(jnode)});
                }
            },
            openNotesItem: {
                label: "Open Notes",
                action: () => {
                    send.browseNotes({id: ctxNode.id, uuid: ctxNode.uuid});
                }
            },
            openOriginalItem: {
                label: "Open Original URL",
                action: async () => {
                    let url = ctxNode.uri;

                    if (url)
                        openContainerTab(url, ctxNode.container);
                }
            },
            openAllItem: {
                label: "Open All",
                separator_before: ctxNode.__filtering && ctxNode.type,
                action: async () => {
                    let children = this.odata.filter(n => ctxJNode.children.some(id => id == n.id) && isEndpoint(n));
                    children.sort(byPosition);

                    for (let node of children)
                        await send.browseNode({node: node});
                }
            },
            openInContainerItem: {
                label: "Open in Container",
                submenu: containersSubmenu
            },
            sortItem: {
                label: "Sort by Name",
                action: () => {
                    let jchildren = ctxJNode.children.map(c => tree.get_node(c));
                    jchildren.sort((a, b) => a.text.localeCompare(b.text));
                    ctxJNode.children = jchildren.map(c => c.id);

                    tree.redraw_node(ctxJNode, true, false, true);
                    this.reorderNodes(ctxJNode);
                }
            },
            newItem: {
                label: "New",
                separator_before: true,
                submenu: {
                    newFolderItem: {
                        label: "Folder",
                        icon: `/icons/group${lightTheme? "": "2"}.svg`,
                        action: async () => {
                            let group = {id: Bookmark.setTentativeId({}), type: NODE_TYPE_GROUP, name: "New Folder",
                                         parent_id: ctxNode.id};
                            const groupPending = send.createGroup({parent: ctxNode, name: group.name});

                            let jgroup = BookmarkTree.toJsTreeNode(group);
                            tree.deselect_all(true);

                            let groupJNode = tree.get_node(tree.create_node(ctxJNode, jgroup, 0));
                            tree.select_node(groupJNode);

                            tree.edit(groupJNode, null, async (jnode, success, cancelled) => {
                                this.startProcessingIndication();
                                group = await groupPending;
                                tree.set_id(groupJNode.id, group.id);

                                if (success && !cancelled && jnode.text)
                                    group = await send.renameGroup({id: group.id, name: jnode.text});

                                tree.rename_node(jnode, group.name);
                                Object.assign(o(jnode), group);
                                jnode.original = BookmarkTree.toJsTreeNode(group);
                                await this.reorderNodes(ctxJNode);

                                this.stopProcessingIndication();
                            });
                        }
                    },
                    newSiblingFolderItem: {
                        label: "Sibling Folder",
                        icon: `/icons/group${lightTheme? "": "2"}.svg`,
                        action: async () => {
                            let jparent = tree.get_node(ctxJNode.parent);
                            let position = $.inArray(ctxJNode.id, jparent.children);

                            let group = {id: Bookmark.setTentativeId({}), type: NODE_TYPE_GROUP, name: "New Folder",
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

                                if (success && !cancelled && jnode.text)
                                    group = await send.renameGroup({id: group.id, name: jnode.text});

                                tree.rename_node(jnode, group.name);
                                Object.assign(o(jnode), group);
                                jnode.original = BookmarkTree.toJsTreeNode(group);
                                await this.reorderNodes(jparent);

                                this.stopProcessingIndication();
                            });
                        }
                    },
                    newBookmarkItem: {
                        label: "Bookmark",
                        icon: `/icons/globe${lightTheme? "": "2"}.svg`,
                        action: async () => {
                            const options = await showDlg("prompt", {caption: "New Bookmark", label: "URL:"});
                            if (options && options.title)
                                send.createBookmarkFromURL({url: options.title, parent_id: ctxNode.id});
                        }
                    },
                    newNotesItem: {
                        label: "Notes",
                        icon: `/icons/notes${lightTheme? "": "2"}.svg`,
                        action: async () => {
                            if (isEndpoint(ctxNode)) {
                                send.browseNotes({id: ctxNode.id, uuid: ctxNode.uuid});
                                return;
                            }

                            let notes = {id: Bookmark.setTentativeId({}), parent_id: ctxNode.id, name: "New Notes",
                                         type: NODE_TYPE_NOTES};
                            const notesPending = send.addNotes({name: notes.name, parent_id: notes.parent_id});

                            let jnotes = BookmarkTree.toJsTreeNode(notes);
                            tree.deselect_all(true);

                            let notesNode = tree.get_node(tree.create_node(ctxJNode, jnotes));
                            tree.select_node(notesNode);

                            tree.edit(notesNode, null, async (jnode, success, cancelled) => {
                                this.startProcessingIndication();
                                notes = await notesPending;
                                tree.set_id(notesNode.id, notes.id);

                                if (success && !cancelled && jnode.text) {
                                    notes.name = jnode.text;
                                    notes = await send.updateBookmark({node: notes});
                                }

                                Object.assign(o(jnode), notes);
                                jnode.original = BookmarkTree.toJsTreeNode(notes);
                                this.data.push(jnode.original);

                                this.stopProcessingIndication();
                            });
                        }
                    },
                    newSeparatorItem: {
                        label: "Separator After",
                        icon: `/icons/separator${lightTheme? "": "2"}.svg`,
                        action: async () => {
                            const jparent = tree.get_node(ctxJNode.parent);
                            const position = $.inArray(ctxJNode.id, jparent.children);
                            let separator = {id: Bookmark.setTentativeId({}), type: NODE_TYPE_SEPARATOR,
                                             parent_id: o(jparent).id};

                            const jnode = BookmarkTree.toJsTreeNode(separator);
                            const separatorJNode = tree.get_node(tree.create_node(jparent, jnode, position + 1));

                            separator = await send.addSeparator({parent_id: o(jparent).id});
                            tree.set_id(separatorJNode.id, separator.id);
                            Object.assign(o(separatorJNode), separator);
                            this.reorderNodes(jparent);
                        }
                    },
                }
            },
            cutItem: {
                separator_before: true,
                label: "Cut",
                _disabled: selectedNodes.some(n => o(n).type === NODE_TYPE_SHELF),
                action: () => tree.cut(selectedNodes)
            },
            copyItem: {
                label: "Copy",
                _disabled: selectedNodes.some(n => o(n).type === NODE_TYPE_SHELF),
                action: () => tree.copy(selectedNodes)
            },
            pasteItem: {
                label: "Paste",
                separator_before: ctxNode.type === NODE_TYPE_SHELF || ctxNode.parent_id == FIREFOX_SHELF_ID,
                _disabled: !(tree.can_paste() && isContainer(ctxNode)),
                action: async () => {
                    let buffer = tree.get_buffer();
                    let selection = Array.isArray(buffer.node)? buffer.node.map(n => o(n)): [o(buffer.node)];
                    selection.sort(byPosition);
                    selection = selection.map(n => n.id);

                    this.startProcessingIndication();

                    try {
                        let new_nodes;
                        if (buffer.mode === "copy_node")
                            new_nodes = await send.copyNodes({node_ids: selection, dest_id: ctxNode.id});
                        else {
                            new_nodes = await send.moveNodes({node_ids: selection, dest_id: ctxNode.id});
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

                        await this.reorderNodes(ctxJNode);
                        tree.clear_buffer();
                    }
                    finally {
                        this.stopProcessingIndication();
                    }
                }
            },
            shareItem: {
                label: "Share",
                separator_before: true,
                submenu: {
                    cloudItem: {
                        label: "Cloud",
                        icon: (lightTheme? "/icons/cloud.png": "/icons/cloud2.png"),
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
                    },
                    oneDriveItem: {
                        label: "OneDrive",
                        icon: "/icons/onedrive.png",
                        action: async () => {
                            if (selectedNodes)
                                await send.shareToOneDrive({nodes: selectedNodes.map(n => o(n))});
                        }
                    }
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
                    let query = `?menu=true&repairIcons=${settings.repair_icons()}&scope=${ctxNode.id}`;
                    openPage(`options.html${query}#checklinks`);
                }
            },
            uploadItem: {
                label: "Upload...",
                action: () => {
                    send.uploadFiles({parent_id: ctxNode.id})
                }
            },
            deleteItem: {
                separator_before: true,
                _disabled: !this._everything && multiselect && selectedNodes.some(n => o(n).type === NODE_TYPE_SHELF),
                label: "Delete",
                action: async () => {
                    if (ctxNode.type === NODE_TYPE_SHELF) {
                        if (selectedNodes.map(n => o(n)).some(n => isBuiltInShelf(n.name))) {
                            showNotification({message: "A built-in shelf could not be deleted."});
                            return;
                        }

                        if (await confirm("Warning", "Do you really want to delete selected items?")) {
                            this.startProcessingIndication();

                            let selectedIds = selectedNodes.map(n => o(n).id);

                            try {
                                await send.softDeleteNodes({node_ids: selectedIds});

                                tree.delete_node(selectedNodes);
                                this.onDeleteShelf(selectedIds);
                            }
                            finally {
                                this.stopProcessingIndication();
                            }
                        }
                    }
                    else {
                        if (await confirm("Warning", "Do you really want to delete selected items?")) {
                            this.startProcessingIndication();

                            try {
                                await send.softDeleteNodes({node_ids: selectedNodes.map(n => o(n).id)});
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
                    if (isEndpoint(ctxNode)) {
                        let properties = await Node.get(ctxNode.id);

                        properties.comments = await Comments.get(properties.id);
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
                                await Bookmark.storeComments(properties.id, properties.comments);

                            delete properties.comments;

                            Bookmark.clean(properties);

                            properties = await send.updateBookmark({node: properties});

                            this.stopProcessingIndication();

                            let live_data = this.data.find(n => n.id == properties.id);
                            Object.assign(ctxNode, properties);
                            Object.assign(live_data, BookmarkTree.toJsTreeNode(ctxNode));

                            if (!ctxNode.__extended_todo)
                                tree.rename_node(ctxJNode, properties.name);
                            else
                                tree.rename_node(ctxJNode, BookmarkTree._formatTODO(ctxNode));

                            tree.redraw_node(ctxJNode, true, false, true);

                            $("#" + properties.id).prop('title', BookmarkTree._formatNodeTooltip(properties));
                        }
                    }
                }
            },
            renameItem: {
                label: "Rename",
                action: async () => {
                    const node = ctxNode;
                    switch (node.type) {
                        case NODE_TYPE_SHELF:
                            const ERROR_MESSAGE = "A built-in shelf could not be renamed.";
                            if (isBuiltInShelf(node.name)) {
                                showNotification({message: ERROR_MESSAGE});
                                return;
                            }

                            tree.edit(node.id, null, async (jnode, success, cancelled) => {
                                if (success && !cancelled) {
                                    if (isBuiltInShelf(jnode.text)) {
                                        tree.rename_node(jnode.id, node.name);
                                        showNotification({message: ERROR_MESSAGE});
                                        return;
                                    }

                                    this.startProcessingIndication();
                                    await send.renameGroup({id: node.id, name: jnode.text})
                                    this.stopProcessingIndication();
                                    node.name = ctxJNode.original.text = jnode.text;
                                    tree.rename_node(jnode.id, jnode.text);
                                    this.onRenameShelf(node);
                                }
                            });
                            break;
                        case NODE_TYPE_GROUP:
                            tree.edit(ctxJNode, null, async (jnode, success, cancelled) => {
                                if (success && !cancelled) {
                                    this.startProcessingIndication();
                                    const group = await send.renameGroup({id: node.id, name: jnode.text});
                                    this.stopProcessingIndication();
                                    node.name = ctxJNode.original.text = group.name;
                                    tree.rename_node(ctxJNode, group.name);
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
                    const options = await showDlg("prompt", {caption: "RDF Directory", label: "Path:",
                                                                        title: ctxNode.uri});
                    if (options) {
                        let node = await Node.get(ctxNode.id);
                        ctxNode.uri = node.uri = options.title;
                        Node.update(node);
                    }
                }
            },
            debugItem: {
                separator_before: true,
                label: "Debug...",
                action: async () => {
                    console.log(ctxNode);
                }
            },
        };

        switch (ctxNode.type) {
            case NODE_TYPE_SHELF:
                delete items.archiveItem;
                delete items.cutItem;
                delete items.copyItem;
                delete items.shareItem;
                delete items.newItem.submenu.newSeparatorItem;
                delete items.newItem.submenu.newSiblingFolderItem;
                if (ctxNode.id === FIREFOX_SHELF_ID) {
                    items = {};
                }
                if (ctxNode.external !== RDF_EXTERNAL_NAME) {
                    delete items.rdfPathItem;
                }
            case NODE_TYPE_GROUP:
                //delete items.newSeparatorItem;
                delete items.openOriginalItem;
                delete items.propertiesItem;
                delete items.copyLinkItem;
                //delete items.shareItem;
                if (items.shareItem) {
                    delete items.shareItem.submenu.pocketItem;
                    delete items.shareItem.submenu.dropboxItem;
                    delete items.shareItem.submenu.oneDriveItem;
                }
                if (ctxNode.type === NODE_TYPE_GROUP)
                    delete items.rdfPathItem;
                if (ctxNode.external && ctxNode.external !== CLOUD_EXTERNAL_NAME)
                    delete items.newItem.submenu.newNotesItem;
                if (ctxNode.special_browser_folder) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.renameItem;
                    delete items.deleteItem;
                    delete items.newItem.submenu.newSeparatorItem;
                    delete items.newItem.submenu.newSiblingFolderItem;
                }
                if (ctxNode.external === RDF_EXTERNAL_NAME) {
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
                delete items.sortItem;
                delete items.openAllItem;
                delete items.newItem.submenu.newFolderItem;
                delete items.renameItem;
                delete items.rdfPathItem;
                delete items.checkLinksItem;
                delete items.uploadItem;
                if (ctxNode.external === RDF_EXTERNAL_NAME) {
                    delete items.cutItem;
                    delete items.copyItem;
                    delete items.pasteItem;
                    delete items.shareItem.submenu.dropboxItem;
                    delete items.shareItem.submenu.oneDriveItem;
                }
                break;
        }

        if (ctxNode.type !== NODE_TYPE_BOOKMARK)
            delete items.archiveItem;

        if (ctxNode.type === NODE_TYPE_SEPARATOR) {
            const deleteItem = items.deleteItem;

            items.newSiblingFolderItem = items.newItem.submenu.newSiblingFolderItem;
            items.newSiblingFolderItem.icon = undefined;
            items.newSiblingFolderItem.label = "New Sibling Folder";

            for (let k in items)
                if (!["newSiblingFolderItem"].find(s => s === k))
                    delete items[k];

            items.deleteItem = deleteItem;
        }

        if (ctxNode.type === NODE_TYPE_NOTES) {
            delete items.newItem.submenu.newNotesItem;
            delete items.openInContainerItem;
            delete items.copyLinkItem;
        }
        else {
            delete items.openItem;
        }

        if (isEndpoint(ctxNode)) {
            delete items.newItem.submenu.newBookmarkItem;

            if (!ctxNode.has_notes || ctxNode.type === NODE_TYPE_NOTES) {
                delete items.openNotesItem;
                if (items.newItem.submenu.newNotesItem)
                    items.newItem.submenu.newNotesItem.label = "Attached Notes";
            }
            else if (ctxNode.has_notes) {
                delete items.newItem.submenu.newNotesItem;
            }
        }
        else {
            delete items.openNotesItem;
        }

        if (ctxNode.__extended_todo) {
            delete items.newItem.submenu.newSeparatorItem;
            delete items.newItem.submenu.newSiblingFolderItem;
        }

        if (!ctxNode.__filtering) {
            delete items.locateItem;
        }

        if (multiselect) {
            items["newItem"] && (items["newItem"]._disabled = true);
            items["sortItem"] && (items["sortItem"]._disabled = true);
            items["uploadItem"] && (items["uploadItem"]._disabled = true);
            items["renameItem"] && (items["renameItem"]._disabled = true);
            items["copyLinkItem"] && (items["copyLinkItem"]._disabled = true);
            items["openNotesItem"] && (items["openNotesItem"]._disabled = true);
            items["propertiesItem"] && (items["propertiesItem"]._disabled = true);
            items["checkLinksItem"] && (items["checkLinksItem"]._disabled = true);
            items["openOriginalItem"] && (items["openOriginalItem"]._disabled = true);
        }

        if (!settings.debug_mode())
            delete items.debugItem;

        return items;
    }
}


export {BookmarkTree};
