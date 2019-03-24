import {settings} from "./settings.js"
import {Backend} from "./backend.js"
import {scriptsAllowed, showNotification, getColorFilter} from "./utils.js"
import {getMainMimeExt} from "./libs/mime.types.js"

const NODE_TYPE_SHELF = 0;
const NODE_TYPE_GROUP = 1;
const NODE_TYPE_BOOKMARK = 2;
const NODE_TYPE_ARCHIVE = 3;

const SHELF_NODE_ROOT_ID = "%root%"

var currTree;
var windowId;

var msg_hub = new MsgHub();

let backend = new Backend("http://localhost:31800", "default:default");

const DEFAULT_SHELF_NAME = "default";


function isBuiltinShelf(name) {
    return false;
}

/* show members of an object */
function dir(o, delimiter) {
    var a = [];
    for (let i in o) {
        a.push(i)
    }
    return a.join(delimiter || "\n");
}

function withCurrTab(fn) {
    browser.tabs.query({currentWindow: true, active: true}).then(function (tabs) {
        fn.apply(null, [tabs[0]]);
    });
}

function genItemId() {
    return new Date().format("yyyyMMddhhmmss");
}

function saveRdf() {
}

function getCurrContainer() {
    var $container;
    var $f = $(".item.focus");
    if ($f.length) {
        if ($f.hasClass("folder")) {
            $container = $f.next(".folder-content");
        } else {
            $container = $f.parent(".folder-content");
        }
    } else {
        $container = $(".root.folder-content");
    }
    return $container;
    ;
}

function getCurrRefId() {
    var $f = $(".item.focus");
    if ($f.length) {
        if (!$f.hasClass("folder")) {
            return $f.attr("id");
        }
    }
}

function showDlg(name, data, callback) {
    if ($(".dlg-cover:visible").length)
        return
    var $dlg = $(".dlg-cover.dlg-" + name).clone().appendTo(document.body);
    $dlg.show();
    data = data || {}
    $dlg.html($dlg.html().replace(/\[([^\[\]]+?)\]/g, function (a, b) {
        return data[b] || ""
    }));
    $dlg.find("input").each(function () {
        if (this.name) {
            if (this.type == "radio") {
                if (this.value == data[this.name])
                    this.checked = true;
            } else {
                if (typeof data[this.name] != "undefined")
                    this.value = data[this.name];
            }
        }
    });
    $dlg.find("input.button-ok").unbind(".dlg");
    $dlg.find("input.button-cancel").unbind(".dlg");
    $dlg.find("input.dialog-input").first().focus();
    /** return promise object */
    var p = new Promise(function (resolve, reject) {
        function proceed() {
            var data = {};
            $dlg.find("input").each(function () {
                if (this.name) {
                    if (this.type == "radio") {
                        if (this.checked)
                            data[this.name] = $(this).val();
                    } else {
                        data[this.name] = $(this).val();
                    }
                }
            })
            $dlg.remove();
            resolve(data);
            // callback && callback(data);
        }

        $dlg.find("input.button-ok").bind("click.dlg", proceed);
        $dlg.find("input.dialog-input").bind("keydown.dlg", ev => {
            if (ev.key == "Enter")
                proceed()
            if (ev.key == "Escape")
                $dlg.remove();
        });
        $dlg.find("input.button-cancel").bind("click.dlg", function () {
            $dlg.remove();
        });
    });
    return p;
}

function alert(title, message) {
    return showDlg("alert", {title: title.translate(), message: message.translate()});
}

function confirm(title, message) {
    return showDlg("confirm", {title: title.translate(), message: message.translate()});
}

/* context menu listener */
function customMenu(ctx_node) { // TODO: i18n
    let tree = $('#treeview').jstree(true);
    let selected_nodes = tree.get_selected(true) || [];
    let multiselect = selected_nodes && selected_nodes.length > 1;
    let all_nodes = tree.settings.core.data;
    let ctx_node_data = ctx_node.original;

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

            }
        },
        openOriginalItem: {
            label: "Open the Original Link",
            action: function () {
                browser.tabs.create({
                    "url": ctx_node_data.uri
                });
            }
        },
        newFolderItem: {
            label: "New Folder...",
            action: function () {
                // TODO: i18n
                showDlg("prompt", {caption: "Create Folder", label: "Name"}).then(dlg_data => {
                    let name;
                    if (name = dlg_data.title) {
                        let selectedOption = $("#shelfList option:selected");
                        let shelf = selectedOption.text();

                        if (!isBuiltinShelf(shelf)) {
                            let parents = ctx_node.parents
                                .filter(p => p !== "#")
                                .map(p => tree.get_node(p).text).reverse();

                            let path = (parents.length? (parents.join("/") + "/"): "") + ctx_node.text + "/" + name;

                            backend.httpPost("/api/create/group", {"path": path}, group => {
                                if (group) {
                                    toJsTreeNode(group);
                                    tree.deselect_all(true);
                                    tree.select_node(tree.create_node(ctx_node, group));
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
            _disabled: !(tree.can_paste() && ctx_node_data.type === NODE_TYPE_GROUP),
            action: function () {
                let buffer = tree.get_buffer();
                let selection =  Array.isArray(buffer.node)
                    ? buffer.node.map(n => n.original.uuid)
                    : [buffer.node.original.uuid];
                backend.httpPost("/api/nodes/" + buffer.mode.split("_")[0], {
                    nodes: selection,
                    dest: ctx_node_data.uuid
                }, new_nodes => {
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
                        tree.create_node(parent, toJsTreeNode(n), "last");
                    }

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
                    action: function () {

                    }
                },
                waitingItem: {
                    label: "WAITING",
                    action: function () {

                    }
                },
                postponedItem: {
                    label: "POSTPONED",
                    action: function () {

                    }
                },
                doneItem: {
                    label: "DONE",
                    action: function () {

                    }
                },
            }
        },
        deleteItem: {
            separator_before: true,
            label: "Delete",
            action: function () {
                confirm("{Warning}", "{ConfirmDeleteItem}").then(() => {
                    let selected_uuids = selected_nodes.map(n => n.original.uuid);

                    backend.httpPost("/api/nodes/delete", {
                            nodes: selected_uuids
                        }, group => {
                            tree.delete_node(selected_nodes);
                        },
                        e => {
                            console.log(e)
                        });
                });
            }
        },
        propertiesItem: {
            separator_before: true,
            label: "Properties...",
            action: function () {
                switch (ctx_node.original.type) {
                    case NODE_TYPE_BOOKMARK:
                    case NODE_TYPE_ARCHIVE:
                        break;
                }
            }
        },
        renameItem: {
            label: "Rename",
            action: function () {
                switch (ctx_node.original.type) {
                    case NODE_TYPE_SHELF:
                        $("#shelf-menu-rename").click();
                        break;
                    case NODE_TYPE_GROUP:
                       showDlg("prompt", {caption: "Rename",
                                    label: "Name", title: ctx_node_data.text}).then(data => {
                            let new_name;
                            if (new_name = data.title) {
                                let parents = ctx_node.parents
                                    .filter(p => p !== "#")
                                    .map(p => tree.get_node(p).text).reverse();

                                let path = parents.join("/") + "/" + ctx_node.text;

                                backend.httpPost("/api/rename/group", {
                                        "path": path,
                                        "new_name": new_name
                                    }, group => {
                                        ctx_node_data.text = new_name;
                                        ctx_node_data.path = group.path;
                                        tree.rename_node(tree.get_node(ctx_node), new_name);
                                    },
                                    e => {
                                        console.log(e)
                                    });
                            }
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
                delete items.todoItem;
                delete items.propertiesItem;
                break;
            case NODE_TYPE_ARCHIVE:
            case NODE_TYPE_BOOKMARK:
                delete items.openAllItem;
                delete items.sortItem;
                delete items.openOriginalItem;
                delete items.newFolderItem;
                delete items.renameItem;
                break;
        }
    }
    else {
        for (let k in items)
            if (!["newFolderItem", "renameItem"].find(s => s === k))
                delete items[k];
    }

    if (multiselect) {
        items["sortItem"] && (items["sortItem"]._disabled = true);
        items["renameItem"] && (items["renameItem"]._disabled = true);
        items["openAllItem"] && (items["openAllItem"]._disabled = true);
        items["newFolderItem"] && (items["newFolderItem"]._disabled = true);
        items["openOriginalItem"] && (items["openOriginalItem"]._disabled = true);
    }

    return items;
}



// var menulistener={};
// menulistener.onDelete = function(){
//     confirm("{Warning}", "{ConfirmDeleteItem}").then(function(){
// 	currTree.removeItem($(".item.focus"), function(){
// 	    saveRdf(); // all done (all sub nodes removed)
// 	});
//     });
// }

function loadShelves() {
    var lastRdf = settings.last_rdf;
    $("#shelfList").html("");
    var saw = false;

    backend.httpGet("/api/list/shelves", (shelves) => {
        $("#shelfList").find("option").remove()
        for (let shelf of shelves) {
            var $opt = $("<option></option>").appendTo($("#shelfList")).html(shelf.name).attr("value", shelf.id);
            if (!saw && typeof lastRdf != "undefined" && shelf.id == lastRdf) {
                saw = true;
                $opt.attr("selected", true);
            }
        }
        switchShelf($("#shelfList").val());
    });
}

/* on page loaded */
function loadAll() {
    loadShelves();
    $("#shelfList").change(function () {
        switchShelf(this.value);
    });
}

function toJsTreeNode(n) {
    n.text = n.name;
    delete n.name;

    n.parent = n.parent_id;
    if (!n.parent)
        n.parent = SHELF_NODE_ROOT_ID;

    if (n.type == NODE_TYPE_GROUP)
        n.icon = "/icons/group.svg";
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

        n.a_attr = {
            "data-uri": n.uri,
            "data-clickable": "true"
        };
    }

    n.data = {};
    n.data.uuid = n.uuid;

    if (!n.icon)
        n.icon = "/icons/homepage.png";

    return n;
}

function switchShelf(rdf) {
    settings.set('last_rdf', rdf);

    let path = $(`#shelfList option[value="${rdf}"]`).text();

    backend.httpPost("/api/list/nodes", {
            path: path
        },
        nodes => {
            let tree = $('#treeview').jstree(true);

            nodes.forEach(toJsTreeNode);

            let shelf_data = [{id: SHELF_NODE_ROOT_ID, parent: "#", text: path, icon: "/icons/bookmarks.svg",
                               type: NODE_TYPE_SHELF}];
            shelf_data = shelf_data.concat(nodes);

            tree.settings.core.data = shelf_data;
            tree.refresh();
            let root_node = tree.get_node(SHELF_NODE_ROOT_ID);
            tree.open_node(root_node);
        },
        error => {
            console.log(error);
        });
}

function requestUrlSaving(itemId) {
    withCurrTab(function (tab) {
        var icon = tab.favIconUrl;
        var ref_id;

        function Next() {
            var $container = null;
            var $f = $(".item.focus");
            if ($f.length) {
                if ($f.hasClass("folder")) {
                    $container = $f.next(".folder-content");
                } else {
                    ref_id = $f.attr("id");
                    $container = $f.parent(".folder-content");
                }
            } else {
                $container = $(".root.folder-content");
            }
            currTree.createLink(getCurrContainer(), "bookmark", itemId, getCurrRefId(), tab.url, icon, tab.title,
                false, true);
            saveRdf();
            showNotification({message: `Capture url "${tab.title}" done`, title: "Info"});
        }

        if (icon.match(/^data:image/i)) {
            var rdf_path = settings.getLastRdfPath();
            var filename = `${rdf_path}/data/${itemId}/favicon.ico`;
            $.post(settings.backend_url + "download", {url: icon, itemId: itemId, filename: filename}, function (r) {
                icon = "resource://scrapbook/data/" + itemId + "/favicon.ico";
                Next();
            })
        } else {
            Next();
        }
    });
}

function requestPageSaving(itemId, type) {
    withCurrTab(async function (tab) {
        var ico = "icons/loading.gif"
        try {
            if (!(await scriptsAllowed(tab.id))) {
                var err = "Content script is not allowed on this page";
                log.error(err)
                await showNotification({message: err, title: "Error"});
                return;
            }
            currTree.createLink(getCurrContainer(), "local", itemId, getCurrRefId(), tab.url, ico, tab.title,
                true, true);
            browser.tabs.sendMessage(tab.id, {type: type, itemId: itemId, windowId: windowId}, null);
        } catch (e) {
            log.error(e.message)
        }
    });
}

function updateMenuItem(t) {
    browser.contextMenus.removeAll(function () {
        browser.contextMenus.create({
            id: "catch", title: `catch ${t}`, onclick: function () {
            }
        });
    });
}

function withFocusedWindow(callback) {
    browser.windows.getLastFocused().then((win) => callback(win));
}

/* receive message from background page */
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (request.type == 'UPDATE_CONTEXTMENU_REQUEST') {

    } else if (request.type == 'SAVE_CONTENT2') {
        savePage2(request.path, request.title, request.content);
    } else if (request.type == 'SAVE_CONTENT' && request.windowId == windowId) {
        savePage(request.itemId, request.content.title, request.content.html,
            request.content.css, request.content.res, function () {
                browser.tabs.sendMessage(sender.tab.id, {
                    type: 'SAVE_CONTENT_FINISHED',
                    itemId: request.itemId,
                    title: request.content.title
                }, null);
            });
    } else if (request.type == 'GET_OTHER_INSTANCE_REQUEST') {
        browser.runtime.sendMessage({session_id: request.session_id});
    } else if (request.type == 'RDF_EDITED') {
        if (request.content.rdf == currTree.rdf) {
            alert("{Warning}", "{SAME_RDF_MODIFIED}").then(function (r) {
                //loadXml(currTree.rdf);
            });
        }
    } else if (request.type == 'SAVE_PAGE_SELECTION_REQUEST') {
        if (currTree && currTree.rendered) {
            withFocusedWindow(function (win) {
                if (win.id == windowId)
                    requestPageSaving(genItemId(), 'GET_PAGE_SELECTION_REQUEST');
            });
        } else {
            log.error("rdf have not been loaded")
        }
    } else if (request.type == 'SAVE_PAGE_REQUEST') {
        if (currTree && currTree.rendered) {
            withFocusedWindow(function (win) {
                if (win.id == windowId) {
                    requestPageSaving(genItemId(), 'GET_PAGE_REQUEST');
                }
            });
        } else {
            log.error("rdf have not been loaded")
        }
    } else if (request.type == 'SAVE_URL_REQUEST') {
        if (currTree && currTree.rendered) {
            withFocusedWindow(function (win) {
                if (win.id == windowId)
                    requestUrlSaving(genItemId());
            });
        } else {
            log.error("rdf have not been loaded")
        }
    }
});
msg_hub.send('GET_OTHER_INSTANCE_REQUEST', '', function (response) {
    // alert("Warning", "Found another window")
});

function postBlob(url, blob, filename, itemId, onload, onerror) {
    var rdf_path = currTree.rdf_path;
    var formData = new FormData();
    formData.append("filename", `${rdf_path}/data/${itemId}/${filename}`);
    formData.append("file", blob);   // add file object
    var request = new XMLHttpRequest();
    request.open("POST", url, false);
    // request.responseType='text';
    request.onload = function (oEvent) {
        onload && onload();
    };
    request.onerror = function (oEvent) {
        onerror && onerror();
    };
    request.send(formData);
}

function savePage(itemId, title, content, css, res, callback) {
    var finished = 0, all = 0;
    $.each(res, function (i, item) {
        if (item.blob) all++;
    });
    $.each(res, function (i, item) {
        if (item.blob) {
            var ext = getMainMimeExt(item.blob.type) || "";
            var reg = new RegExp(item.hex, "g")
            if (item.hex) content = content.replace(reg, item.hex + ext);
            postBlob(settings.backend_url + "savebinfile", item.blob, item.filename || (item.hex + ext),
                itemId, function () {
                if (++finished == all) {
                    content = ['<!Doctype html>', content,].join("\n");
                    var rdf_path = currTree.rdf_path;
                    $.post(settings.backend_url + "savefile", {
                        filename: `${rdf_path}/data/${itemId}/index.html`,
                        content: content
                    }, function (r) {
                        $.post(settings.backend_url + "savefile", {
                            filename: `${rdf_path}/data/${itemId}/index.css`,
                            content: css,
                            folder: settings.getLastRdfPath() + "data/" + itemId
                        }, function (r) {
                            /** update the icon */
                            var icon = "resource://scrapbook/data/" + itemId + "/favicon.ico";
                            $("#" + itemId).removeAttr("disabled");
                            currTree.updateItemIcon($("#" + itemId), icon);
                            /** save xml file when all files uploaded */
                            saveRdf();
                            showNotification({message: `Capture content of "${title}" done`, title: "Info"});
                            callback && callback();
                        });
                    });
                }
            }, function () {
                // error
            });
        }
    });
}

function savePage2(path, title, content) {
    $.post(settings.backend_url + "savefile", {filename: `${path}/index.html`, content: content}, function (r) {
        showNotification({message: `Save content of "${title}" done`, title: "Info"});
    });
}

document.addEventListener('contextmenu', function (event) {
    if ($(".dlg-cover:visible").length)
        event.preventDefault()
    return false;
});
browser.windows.getCurrent({populate: true}).then((windowInfo) => {
    windowId = windowInfo.id;
});

window.onload = function () {
    /* i18n */
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();

    var btn = document.getElementById("btnLoad");
    btn.onclick = function () {
        loadShelves();
    };
    var btn = document.getElementById("btnSet");
    btn.onclick = function () {
        browser.tabs.create({
            "url": "options.html"
        });
    }
    var btn = document.getElementById("btnHelp");
    btn.onclick = function () {
        browser.tabs.create({
            "url": "options.html#help"
        });
    }
    var btn = document.getElementById("btnSearch");
    btn.onclick = function () {
        browser.tabs.create({
            "url": "search.html"
        });
    }

    $("#shelf-menu-button").click(() => {
        $("#shelf-menu").toggle()
    });
    $("#shelf-menu-create").click(() => {
        // TODO: i18n
        showDlg("prompt", {caption: "Create shelf", label: "Name"}).then(data => {
            let name;
            if (name = data.title) {
                let existingOption = $(`#shelfList option:contains("${name}")`);
                let selectedOption = $("#shelfList option:selected");

                if (existingOption.length) {
                    selectedOption.removeAttr("selected");
                    existingOption.attr("selected", true);
                }

                if (name !== DEFAULT_SHELF_NAME) {
                    backend.httpPost("/api/create/shelf", {"name": name}, (shelf) => {
                        if (shelf) {
                            selectedOption.removeAttr("selected");
                            $("<option></option>").appendTo($("#shelfList"))
                                .html(shelf.name)
                                .attr("value", shelf.id)
                                .attr("selected", true);

                            switchShelf(shelf.id);
                        }
                    });
                }
            }
        });
    });

    $("#shelf-menu-rename").click(() => {
        let selectedOption = $("#shelfList option:selected");
        let name = selectedOption.text();

        if (name && name !== DEFAULT_SHELF_NAME) {
            // TODO: 118n
            showDlg("prompt", {caption: "Rename", label: "Name", title: name}).then(data => {
                let newName;
                if (newName = data.title) {
                    backend.httpPost("/api/rename/shelf", {"name": name, "new_name": newName}, () => {
                            selectedOption.html(newName);
                            let tree = $("#treeview").jstree(true);
                            tree.rename_node(tree.get_node(SHELF_NODE_ROOT_ID), newName);
                        },
                        e => {
                            console.log(e)
                        });
                }
            });
        } else if (name === DEFAULT_SHELF_NAME) {
            // TODO: i18n
            alert("{Error}", "The shelf 'default' could not be renamed.")
        }

    });

    $("#shelf-menu-delete").click(() => {
        let selectedOption = $("#shelfList option:selected");
        let name = selectedOption.text();

        if (name === DEFAULT_SHELF_NAME) {
            // TODO: i18n
            alert("{Error}", "The 'default' shelf could not be deleted.")
            return;
        }

        // TODO: 118n
        confirm("{Warning}", "Do you really want to delete '" + name + "'?").then(() => {
            if (name && name !== DEFAULT_SHELF_NAME) {
                backend.httpPost("/api/delete/shelf", {"name": name}, () => {
                        let prevItem = null;
                        let found = false;
                        $("#shelfList option").each((i, o) => {
                            if (found) {
                                return;
                            }

                            if (o.value === selectedOption.val()) {
                                found = true;
                                return;
                            }
                            prevItem = o;
                        });

                        selectedOption.removeAttr("selected");
                        if (prevItem) {
                            $(prevItem).attr("selected", true);
                            switchShelf(prevItem.value);
                        }
                        selectedOption.remove();
                    },
                    e => {
                        console.log(JSON.stringify(e))
                    }
                );
            }
        });
    });

    $("#treeview").jstree({
        plugins: ["wholerow", "contextmenu", "dnd"],
        core: {
            worker: false,
            animation: 0,
            check_callback: true,
            themes: {
                name: "default",
                dots: false,
                icons: true,
            }
        },
        contextmenu: {
            show_at_node: false,
            items: customMenu
        }
    })

    $(document).on("click.jstree", $(".jstree-anchor"), function(e) {
        if(e.button === 0 || e.button === 1) {
            let clickable = e.target.getAttribute("data-clickable");
            let uri = e.target.getAttribute("data-uri");
            if (clickable && !e.ctrlKey)
                browser.tabs.create({
                    "url": uri
                });
            if (!event.target.matches("#shelf-menu-button"))
                $(".simple-menu").hide();
            e.preventDefault();
            return false;
        }
    });


    loadAll();
};
console.log("==> main.js loaded");
