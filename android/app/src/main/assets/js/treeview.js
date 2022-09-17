var DEFAULT_POSITION = 2147483647;

var FORMAT_TYPE_CLOUD = "cloud";
var FORMAT_TYPE_INDEX = "index";

var NODE_TYPE_SHELF = "shelf";
var NODE_TYPE_FOLDER = "folder";
var NODE_TYPE_BOOKMARK = "bookmark";
var NODE_TYPE_ARCHIVE = "archive";
var NODE_TYPE_SEPARATOR = "separator";
var NODE_TYPE_NOTES = "notes";

var DEFAULT_SHELF_UUID = "default"

var CLOUD_SHELF_ID = -5;
var CLOUD_SHELF_NAME = "cloud";
var CLOUD_EXTERNAL_NAME = "cloud";

var RDF_EXTERNAL_TYPE = "rdf";

var TODO_STATE_TODO = "TODO";
var TODO_STATE_DONE = "DONE";
var TODO_STATE_WAITING = "WAITING";
var TODO_STATE_POSTPONED = "POSTPONED";
var TODO_STATE_CANCELLED = "CANCELLED";

var IMAGE_FORMATS = [
    "image/png",
    "image/bmp",
    "image/gif",
    "image/tiff",
    "image/jpeg",
    "image/x-icon",
    "image/webp",
    "image/svg+xml"
];

var CONTENT_TYPES = [NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES];
var CONTAINER_TYPES = [NODE_TYPE_SHELF, NODE_TYPE_FOLDER];

var NOTES_OBJECT_FILE = "notes.json"
var ARCHIVE_CONTENT_FILE = "archive_content.blob"
var ARCHIVE_CONTENT_FILES = "files"

function o(n) { return n.data; }

function _styleTODO(node) {
    if (node.todo_state)
        return " todo-state-" + (node._overdue
            ? "overdue"
            : node.todo_state.toLowerCase());

    return "";
}

function toJsTreeNode(node) {
    var jnode = {};

    jnode.id = node.uuid;
    jnode.text = node.title || "";
    jnode.type = node.type;
    jnode.icon = node.icon;
    jnode.data = node; // store the original Scrapyard node
    jnode.parent = node.parent;

    if (!jnode.parent)
        jnode.parent = "#";

    if (node.type === NODE_TYPE_SHELF && node.external === CLOUD_EXTERNAL_NAME) {
        jnode.li_attr = {"class": "cloud-shelf"};
        jnode.icon = "icons/cloud.svg";
    }
    else if (node.type === NODE_TYPE_SHELF && node.external === RDF_EXTERNAL_TYPE) {
        jnode.li_attr = {"class": "rdf-archive"};
        jnode.icon = "icons/tape.svg";
    }
    else if (node.type === NODE_TYPE_SHELF) {
        jnode.icon = "icons/shelf.svg";
        jnode.li_attr = {"class": "scrapyard-shelf"};
    }
    else if (node.type === NODE_TYPE_FOLDER) {
        jnode.icon = "icons/group.svg";
        jnode.li_attr = {
            class: "scrapyard-group",
        };
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
            title: _formatNodeTooltip(node),
            "data-clickable": "true"
        };

        if (node.type === NODE_TYPE_ARCHIVE)
            jnode.li_attr.class += " archive-node";

        jnode.a_attr = {
            class: node.has_notes? "has-notes": ""
        };

        if (node.todo_state)
            jnode.a_attr.class += _styleTODO(node);

        if (node.type === NODE_TYPE_NOTES)
            jnode.li_attr.class += " scrapyard-notes";

        if (node.type === NODE_TYPE_NOTES)
            jnode.icon = "icons/notes.svg";
        else if (node.content_type === "application/pdf")
            jnode.icon = "icons/format-pdf.svg";
        else if (IMAGE_FORMATS.some(function (f) { return f === node.content_type; }))
            jnode.icon = "icons/format-image.svg";

        if (!jnode.icon && !node.has_icon) {
            jnode.icon = "icons/globe.svg";
            jnode.a_attr.class += " generic-icon";
        }
        else if (node.has_icon) {
            jnode.icon = node.uuid;
        }
    }

    return jnode;
}

function _formatNodeTooltip(node) {
    return node.title + (node.url? "\x0A" + node.url: "");
}

function createTree() {
    var plugins = ["wholerow", "contextmenu"];

    window.rememberTreeState = window.location.hash.includes("rememberTreeState")
    if (window.rememberTreeState)
        plugins.push("state");

    $("#treeview").jstree({
        plugins: plugins,
        core: {
            worker: false,
            animation: 0,
            multiple: false,
            themes: {
                name: "default",
                dots: false,
                icons: true,
            },
            check_callback: function(operation, node, parent, position) {
                if(operation == 'delete_node') {
                    return true;
                }
            }
        },
        contextmenu: {
            show_at_node: false,
            items: contextMenu
        },
        state: {}
    });

    window.tree = $("#treeview").jstree(true);
}

createTree();

function contextMenu(jnode) {
    var node = jnode.data;
    var items = {
        openOriginalItem: {
            label: "Open Original URL",
            action: function () {
                if (node.url)
                    document.location.href = node.url;
            }
        },
        viewNotesItem: {
            label: "View notes",
            action: function() {
                Android.openArchive(node.uuid, NOTES_OBJECT_FILE);
            }
        },
        deleteItem: {
            label: "Delete",
            separator_before: node.has_notes || node.type === NODE_TYPE_ARCHIVE,
            action: function() {
                if (confirm("Do you really want to delete the selected item?")) {
                    Android.deleteNode(node.uuid);
                    window.tree.delete_node(jnode);
                }
            }
        }
    };

    if (node.type !== NODE_TYPE_ARCHIVE)
        delete items.openOriginalItem;

    if (!node.has_notes)
        delete items.viewNotesItem;

    if (node.type === NODE_TYPE_SHELF && node.external === CLOUD_EXTERNAL_NAME)
        delete items.deleteItem;

    return items;
}

$(document).on("click", ".jstree-anchor", handleMouseClick);

function handleMouseClick(e) {
    var jnode = window.tree.get_selected(true)[0];
    if (jnode) {
        var node = o(jnode);

        if (node.type === NODE_TYPE_BOOKMARK) {
            document.location.href = node.url;
        }
        else if (node.type === NODE_TYPE_ARCHIVE) {
            if (node.contains === ARCHIVE_CONTENT_FILES)
                Android.openArchive(node.uuid, ARCHIVE_CONTENT_FILES);
            else if (node.content_type && node.content_type.indexOf("text/html") >= 0)
                Android.openArchive(node.uuid, ARCHIVE_CONTENT_FILE);
            else if (node.content_type)
                Android.downloadArchive(node.uuid, node.title, node.content_type);
            else
                document.location.href = node.url;
        }
        else if (node.type === NODE_TYPE_NOTES) {
            Android.openArchive(node.uuid, NOTES_OBJECT_FILE);
        }
        else if (node.type === NODE_TYPE_FOLDER || node.type === NODE_TYPE_SHELF) {
            window.tree.toggle_node(jnode.id);
        }
    }
}

var INPUT_TIMEOUT = 1000;
var filterInputTimeout;
$("#search-input").on("input", function (e) {
    clearTimeout(filterInputTimeout);

    if (e.target.value) {
        $("#search-input-clear").show();
        filterInputTimeout = setTimeout(function () { performSearch(e.target.value) }, INPUT_TIMEOUT);
    }
    else {
        filterInputTimeout = null;
        $("#search-input-clear").hide();
        performSearch();
    }
});

$("#search-input-clear").click(function (e) {
    clearSearchInput();
    $("#search-input").trigger("input");
});

function clearSearchInput() {
    $("#search-input").val("");
    $("#search-input-clear").hide();
}

function performSearch(text) {
    if (text) {
        if (text.length > 2) {
            text = text.toLocaleLowerCase();
            var results = tree.__nodes.filter(function (jnode) {
                var node = o(jnode);
                return CONTENT_TYPES.some(function (t) { return t == node.type })
                    && (node.title && node.title.toLocaleLowerCase().indexOf(text) >= 0
                        ||  node.url && node.url.toLocaleLowerCase().indexOf(text) >= 0);
            });

            listTreeNodes(results);
        }
    }
    else {
        tree.settings.core.data = tree.__nodes;
        tree.refresh(true);
        if (tree.__nodes.length > 0 && tree.__nodes[0].text == CLOUD_SHELF_NAME)
            tree.open_node(CLOUD_SHELF_NAME);
    }
}

function listTreeNodes(nodes) {
    nodes = nodes.map(function (n) { return $.extend({}, n) });
    nodes.forEach(function (n) { n.parent = "#" });
    tree.settings.core.data = nodes;

    tree.refresh(true);
    tree.deselect_all(true);
}

tree.iconCache = {}

tree.__icon_set_hook = function(jnode) {
    if (jnode.icon && jnode.icon.startsWith("icons/")) {
        return "url(\"" + jnode.icon + "\")";
    }
    else {
        var node = o(jnode)

        if (node && node.download_icon) {
            var icon = this.iconCache[node.icon];

            if (icon)
                return "url(\"" + icon + "\")";
            else
                return "url(\"icons/globe.svg\")";
        }
        else
            return "url(\"" + jnode.icon + "\")";
    }
};

tree.__icon_check_hook = function(a_element, jnode) {
    if (jnode.__icon_validated || (jnode.icon && jnode.icon.startsWith("icons/")))
        return;

    setTimeout(function () {
        var node = o(jnode);

        if (node && node.download_icon) {
            var cached = tree.iconCache[node.icon];

            if (cached)
                setNodeIcon(cached, a_element)
            else
                downloadIcon(node, a_element.id);
        }
        else {
            var image = new Image();

            image.onerror = function(e) {
                var fallback_icon = "icons/globe.svg";
                jnode.icon = fallback_icon;
                setNodeIcon(fallback_icon, a_element);
            };
            image.src = jnode.icon;
        }
    }, 0);

    jnode.__icon_validated = true;
};

function getIconElement(a_element) {
    return new Promise(function (resolve, reject) {
        var a_element2 = document.getElementById(a_element.id);
        if (a_element2) {
            resolve(a_element2.childNodes[0]);
        }
        else {
            setTimeout(function () {
                var a_element2 = document.getElementById(a_element.id);
                if (a_element2) {
                    resolve(a_element2.childNodes[0]);
                }
                else {
                    console.error("can't find icon element");
                    resolve(null);
                }
            }, 100);
        }
    });
}

function setNodeIcon(icon, a_element) {
    getIconElement(a_element).then(function (element) {
        if (element)
            element.style.backgroundImage = "url(\"" + icon + "\")"
    });
}

function setNodeIconExternal(icon, elementId, hash) {
    if (icon) {
        tree.iconCache[hash] = icon;
        setNodeIcon(icon, {id: elementId});
    }
    else
        setNodeIcon("icons/globe.svg", {id: elementId});
}

function downloadIcon(node, elementId) {
    return new Promise(function (resolve, reject) {
        Android.downloadIcon(node.uuid, elementId, node.icon);
        resolve();
    })
}

var root = {id: CLOUD_SHELF_NAME,
            pos: -2,
            title: CLOUD_SHELF_NAME,
            uuid: CLOUD_SHELF_NAME,
            type: NODE_TYPE_SHELF,
            external: CLOUD_EXTERNAL_NAME
            };

function byPosition(a, b) {
    var a_pos = a.pos === undefined? DEFAULT_POSITION: a.pos;
    var b_pos = b.pos === undefined? DEFAULT_POSITION: b.pos;
    return a_pos - b_pos;
}

function injectCloudBookmarks(bookmarks) {
    clearSearchInput();

    var lines = bookmarks.split("\n").filter(function (s) {return !!s});
    var metaJSON = lines.shift();
    var meta;

    if (metaJSON)
        meta = JSON.parse(metaJSON);

    if (meta && meta.type === FORMAT_TYPE_CLOUD)
        injectCloudShelfBookmarks(lines)
    else if (meta && meta.type === FORMAT_TYPE_INDEX)
        injectSyncBookmarks(lines)

    hideLoadingAnimation();
}

function injectCloudShelfBookmarks(lines) {
    var nodes = [root];

    if (lines) {
        lines.forEach(function (line) {
            var node = JSON.parse(line);
            node.download_icon = node.has_icon;
            nodes.push(node);
        });
    }

    nodes.sort(byPosition);

    var jnodes = nodes.map(toJsTreeNode);
    tree.settings.state.key = "tree-state-cloud";
    addNodesToTree(jnodes);
    tree.open_node(CLOUD_SHELF_NAME);
}

function injectSyncBookmarks(lines) {
    var nodes = [];

    if (lines) {
        lines.forEach(function (line) {
            var node = JSON.parse(line);

            if (node.type === NODE_TYPE_SHELF && node.uuid === DEFAULT_SHELF_UUID)
                node.pos = -1;
            node.download_icon = node.has_icon;
            nodes.push(node);
        });
    }

    nodes.sort(byPosition);

    var jnodes = nodes.map(toJsTreeNode);
    tree.settings.state.key = "tree-state-sync";
    addNodesToTree(jnodes);
}

function addNodesToTree(nodes) {
    tree.__nodes = nodes;
    tree.settings.core.data = nodes;

    if (window.rememberTreeState) {
        var stateJSON = localStorage.getItem(tree.settings.state.key);

        if (stateJSON) {
            var state = JSON.parse(stateJSON);

            tree.refresh(true, function() {return state.state});
        }
        else
            tree.refresh(true);
    }
    else
        tree.refresh(true)

    tree.deselect_all()
}

function handleEmptyContent(dbType) {
    if (dbType === "cloud")
        handleEmptyCloud()
    else if (dbType === "sync")
        handleEmptySync()

    hideLoadingAnimation();
}

function handleEmptyCloud() {
    var nodes = [root];
    var jnodes = nodes.map(toJsTreeNode);
    addNodesToTree(jnodes);
}

function handleEmptySync() {
    showEmptySync();
}

function handleNoConnection() {
    hideLoadingAnimation();
    showOffline();
}

function showLoadingAnimation() {
    $("#animation").show();
}

function hideLoadingAnimation() {
    $("#animation").hide();
}

function showOffline() {
    $("#offline").show();
}

function hideOffline() {
    $("#offline").hide();
}

function showEmptySync() {
    $("#empty_sync").css("display", "flex");
}

function hideEmptySync() {
    $("#empty_sync").hide();
}

function hideFillers() {
    hideOffline();
    hideEmptySync();
}

$("#btnLoad").on("click", function(e) {
    Android.refreshTree();
});
