var DEFAULT_POSITION = 2147483647;

var NODE_TYPE_SHELF = 1;
var NODE_TYPE_GROUP = 2;
var NODE_TYPE_BOOKMARK = 3;
var NODE_TYPE_ARCHIVE = 4;
var NODE_TYPE_SEPARATOR = 5;
var NODE_TYPE_NOTES = 6;

var CLOUD_SHELF_ID = -5;
var CLOUD_SHELF_NAME = "cloud";
var CLOUD_EXTERNAL_NAME = "cloud";

var TODO_STATE_TODO = 1;
var TODO_STATE_DONE = 4;
var TODO_STATE_WAITING = 2;
var TODO_STATE_POSTPONED = 3;
var TODO_STATE_CANCELLED = 5;

var TODO_NAMES = {
    1: "TODO",
    2: "WAITING",
    3: "POSTPONED",
    5: "CANCELLED",
    4: "DONE"
};

var TODO_STATES = {
    "TODO": TODO_STATE_TODO,
    "WAITING": TODO_STATE_WAITING,
    "POSTPONED": TODO_STATE_POSTPONED,
    "CANCELLED": TODO_STATE_CANCELLED,
    "DONE": TODO_STATE_DONE
};

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

function _styleTODO(node) {
    if (node.todo_state)
        return " todo-state-" + (node._overdue
            ? "overdue"
            : TODO_NAMES[node.todo_state].toLowerCase());

    return "";
}

function toJsTreeNode(n) {
    n.text = n.name;

    n.parent = n.parent_id;
    if (!n.parent)
        n.parent = "#";

    if (n.type == NODE_TYPE_SHELF) {
        n.icon = "icons/cloud.svg";
        n.li_attr = {"class": "cloud-shelf"};
    }
    else if (n.type == NODE_TYPE_GROUP) {
        n.icon = "icons/group.svg";
        n.li_attr = {
            "class": "scrapyard-group",
        };
    }
    else if (n.type == NODE_TYPE_SEPARATOR) {
        n.text = "──".repeat(60);
        n.icon = false;
        n.a_attr = {
            "class": "separator-node"
        };
    }
    else if (n.type != NODE_TYPE_SHELF) {
        var urin = "";
        if (n.uri)
            urin = false //n.uri.length > 60
                ? "\x0A" + n.uri.substring(0, 60) + "..."
                : ("\x0A" + n.uri);

        n.li_attr = {
            "class": "show_tooltip",
            "title": n.text + urin,
            "data-id": n.id,
            "data-clickable": "true"
        };

        if (n.type == NODE_TYPE_ARCHIVE)
            n.li_attr.class += " archive-node";

        n.a_attr = {
            "class": n.has_notes? "has-notes": "",
            "href": n.uri
        };

        if (n.todo_state) {
            n.a_attr.class += _styleTODO(n);

            if (n._extended_todo) {
                n.li_attr.class += " extended-todo";
                n.text = _formatTODO(n);
            }
        }

        if (n.type == NODE_TYPE_NOTES) {
            n.icon = "icons/notes.svg";
            n.li_attr.class += " scrapyard-notes";
        }

        if (n.icon_data)
            n.icon = n.icon_data;

        if (!n.icon) {
            if (n.content_type === "application/pdf")
                n.icon = "icons/format-pdf.svg";
            else if (IMAGE_FORMATS.some(function(f) {return f === n.content_type;}))
                n.icon = "icons/format-image.svg";
            else {
                n.icon = "icons/globe.svg";
                n.a_attr.class += " generic-icon";
            }
        }
    }

    n.data = $.extend({}, n);

    return n;
}

$("#treeview").jstree({
    plugins: ["wholerow", "contextmenu"],
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
    }
});

window.tree = $("#treeview").jstree(true);

function contextMenu(jnode) {
    var node = jnode.data;
    var items = {
        viewNotesItem: {
            label: "View notes",
            action: function() {
                Android.openArchive(node.uuid, "view");
            }
        },
        deleteItem: {
            label: "Delete",
            separator_before: node.has_notes,
            action: function() {
                if (confirm("Do you really want to delete the selected item?")) {
                    Android.deleteNode(node.uuid);
                    window.tree.delete_node(jnode);
                }
            }
        }
    };

    if (!node.has_notes)
        delete items.viewNotesItem;

    if (node.type === NODE_TYPE_SHELF)
        delete items.deleteItem;

    return items;
}

$(document).on("click", ".jstree-anchor", handleMouseClick);

function handleMouseClick(e) {
    var jnode = window.tree.get_selected(true)[0];
    if (jnode) {
        var node = jnode.data;
        if (node.type === NODE_TYPE_BOOKMARK) {
            document.location.href = node.uri;
        }
        else if (node.type === NODE_TYPE_ARCHIVE) {
            if (node.content_type && node.content_type.indexOf("text/html") >= 0)
                Android.openArchive(node.uuid, "data");
            else if (node.content_type)
                Android.downloadArchive(node.uuid, node.name, node.content_type);
            else
                document.location.href = node.uri;
        }
        else if (node.type === NODE_TYPE_NOTES) {
            Android.openArchive(node.uuid, "view");
        }
        else if (node.type === NODE_TYPE_GROUP || node.type === NODE_TYPE_SHELF) {
            window.tree.toggle_node(jnode.id);
        }
    }
}

tree.__icon_check_hook = function(a_element, node) {
    if (node.__icon_validated || !node.icon || (node.icon && node.icon.indexOf("icons/") == 0))
        return;

    setTimeout(function () {
        var getIconElement = function () {
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

        var image = new Image();

        image.onerror = function(e) {
            var fallback_icon = 'url("icons/globe.svg")';
            node.icon = fallback_icon;
            getIconElement().then(function (e) {e.style.backgroundImage = fallback_icon});
        };
        image.src = node.icon;
    }, 0);

    node.__icon_validated = true;
};

var root = {id: CLOUD_SHELF_NAME,
            pos: -2,
            name: CLOUD_SHELF_NAME,
            uuid: CLOUD_SHELF_NAME,
            type: NODE_TYPE_SHELF,
            external: CLOUD_EXTERNAL_NAME
            };

function byPosition(a, b) {
    var a_pos = a.pos === undefined? DEFAULT_POSITION: a.pos;
    var b_pos = b.pos === undefined? DEFAULT_POSITION: b.pos;
    return a_pos - b_pos;
}

function extractNode(bookmark) {
    var node = bookmark.node;
    node.id = node.uuid;
    if (bookmark.icon)
        node.icon = bookmark.icon.data_url;
    return node;
}

function injectCloudBookmarks(bookmarks) {
    var nodes = [root];
    var lines = bookmarks.split("\n").filter(function (s) {return !!s});

    lines.shift();

    var objects = lines.shift();
    if (objects)
        objects = JSON.parse(objects);
    if (objects.nodes)
        objects = objects.nodes.map(extractNode);
    else
        objects = [];
    objects.sort(byPosition);

    nodes = nodes.concat(objects);
    nodes.forEach(toJsTreeNode);

    tree.settings.core.data = nodes;
    tree.deselect_all();
    tree.refresh(true);
    tree.open_node(CLOUD_SHELF_NAME);

    hideAnimation();
}

function showAnimation() {
    $("#animation").show();
}

function hideAnimation() {
    $("#animation").hide();
}

$("#btnLoad").on("click", function(e) {
    Android.refreshTree();
});
