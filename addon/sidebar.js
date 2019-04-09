import {settings} from "./settings.js"
import {backend} from "./backend.js"
import {BookmarkTree} from "./tree.js"
import {showDlg, confirm} from "./dialog.js"

import {
    EVERYTHING,
    DEFAULT_SHELF_NAME,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    TODO_SHELF,
    DONE_SHELF,
    EVERYTHING_SHELF,
    TODO_NAME,
    DONE_NAME
} from "./db.js";

import {
    SEARCH_MODE_TITLE,
    SEARCH_MODE_TAGS,
    SEARCH_MODE_CONTENT,
    SEARCH_MODE_FIREFOX,
    SearchContext

} from "./search.js";
import {pathToNameExt, showNotification} from "./utils.js";


const INPUT_TIMEOUT = 1000;

function isSpecialShelf(name) {
    name = name.toLocaleUpperCase();
    return name === DEFAULT_SHELF_NAME.toLocaleUpperCase()
        || name === EVERYTHING.toLocaleUpperCase()
        || name === TODO_NAME
        || name === DONE_NAME;
}

function validSearchInput(input) {
    return input && input.length > 2;
}

function canSearch() {
    let input = $("#search-input").val();

    return validSearchInput(input);
}

async function performSearch(context, tree) {
    let input = $("#search-input").val();

    if (validSearchInput(input) && !context.isInSearch) {
        context.inSearch();
    }
    else if (!validSearchInput(input) && context.isInSearch) {
        context.outOfSearch();
        switchShelf(context, tree, $(`#shelfList option:contains("${context.shelfName}")`).val());
    }

    if (validSearchInput(input))
        return context.search(input).then(nodes => {
            tree.list(nodes);
        });
}

function performImport(context, tree, file, file_name, file_ext) {

    $("#shelf-menu-button").attr("src", "icons/grid.svg");

    return browser.runtime.sendMessage({type: "IMPORT_FILE", file: file, file_name: file_name, file_ext: file_ext})
        .then(() => {

            $("#shelf-menu-button").attr("src", "icons/menu.svg");

            if (file_name === EVERYTHING) {
                settings.last_shelf(EVERYTHING_SHELF);

                loadShelves(context, tree).then(() => {
                    tree.openRoot();
                });
                invalidateCompletion();
            }
            else
                backend.queryShelf(file_name).then(shelf => {

                    settings.last_shelf(shelf.id);

                    loadShelves(context, tree).then(() => {
                        tree.openRoot();
                    });
                    invalidateCompletion();
                });
        }).catch(() => {
            $("#shelf-menu-button").attr("src", "icons/menu.svg");
            showNotification({message: "The import has failed."});
        });
}

function performExport(context, tree) {
    let {id: shelf_id, name: shelf} = getCurrentShelf();

    let special_shelf = shelf_id === EVERYTHING_SHELF || shelf_id === TODO_SHELF || shelf_id === DONE_SHELF;
    let root = special_shelf
        ? tree._jstree.get_node("#")
        : tree._jstree.get_node(tree.data.find(n => n.type == NODE_TYPE_SHELF).id);
    let skip_level = root.parents.length;
    let uuid = special_shelf? shelf: root.original.uuid;

    let nodes = [];
    tree.traverse(root, node => {
        let data = Object.assign({}, node.original)

        delete data._path;
        delete data.a_attr;
        delete data.li_attr;
        delete data.state;
        delete data.text;

        data.level = node.parents.length - skip_level;
        nodes.push(data);
    });

    nodes.shift();

    $("#shelf-menu-button").attr("src", "icons/grid.svg");

    return browser.runtime.sendMessage({type: "EXPORT_FILE", nodes: nodes, shelf: shelf, uuid: uuid}).then(() => {
            $("#shelf-menu-button").attr("src", "icons/menu.svg");
    }).catch(e => {
        console.log(e);
        $("#shelf-menu-button").attr("src", "icons/menu.svg");
        showNotification({message: "The export has failed."});
    });
}

function styleBuiltinShelf() {
    let {id, name} = getCurrentShelf();

    if (isSpecialShelf(name) && name !== DEFAULT_SHELF_NAME)
        $("div.selectric span.label").addClass("option-builtin");
    else
        $("div.selectric span.label").removeClass("option-builtin");
}

function invalidateCompletion() {
    browser.runtime.sendMessage("ubiquitywe@firefox", {type: "SCRAPYARD_INVALIDATE_COMPLETION"});
}

function loadShelves(context, tree) {
    let shelf_list = $("#shelfList");

    shelf_list.html(`
        <option class="option-builtin" value="${TODO_SHELF}">${TODO_NAME}</option>
        <option class="option-builtin" value="${DONE_SHELF}">${DONE_NAME}</option>
        <option class="option-builtin divide" value="${EVERYTHING_SHELF}">${EVERYTHING}</option>
    `);

    return backend.listShelves().then(shelves => {
        for (let shelf of shelves)
            $("<option></option>").appendTo(shelf_list).html(shelf.name).attr("value", shelf.id);

        let last_shelf_id = settings.last_shelf() || 1;

        if (last_shelf_id === "null")
            last_shelf_id = 1;

        let last_shelf = $(`#shelfList option[value="${last_shelf_id}"]`);
        last_shelf = last_shelf? last_shelf: $(`#shelfList option[value="1"]`);
        shelf_list.val(parseInt(last_shelf.val()))

        styleBuiltinShelf();
        shelf_list.selectric('refresh');

        return switchShelf(context, tree, shelf_list.val());
    }).catch(() => {
        shelf_list.val(1);
        shelf_list.selectric('refresh');
        return switchShelf(context, tree, 1);
    });
}

function switchShelf(context, tree, shelf_id) {
    let path = $(`#shelfList option[value="${shelf_id}"]`).text();

    settings.last_shelf(shelf_id);

    context.shelfName = path;

    if (canSearch())
        return performSearch(context, tree);
    else {
        if (shelf_id == TODO_SHELF) {
            return backend.listTODO().then(nodes => {
                tree.list(nodes, TODO_NAME);
            });
        }
        else if (shelf_id == DONE_SHELF) {
            return backend.listDONE().then(nodes => {
                tree.list(nodes, DONE_NAME);
            });
        }
        else if (shelf_id == EVERYTHING_SHELF) {
            return backend.listNodes({
                order: "custom"
            }).then(nodes => {
                tree.update(nodes, true);
            });
        }
        else {
            return backend.listNodes({
                path: path,
                depth: "root+subtree",
                order: "custom"
            }).then(nodes => {
                tree.update(nodes);
            });
        }
    }
}

document.addEventListener('contextmenu', function (event) {
    if ($(".dlg-cover:visible").length)
        event.preventDefault()
    return false;
});

function getCurrentShelf() {
    let selectedOption = $(`#shelfList option[value='${$("#shelfList").val()}']`);
    return {
        id: parseInt(selectedOption.val()),
        name: selectedOption.text()
    };
}

window.onload = function () {
    /* i18n */
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();

    let tree = new BookmarkTree("#treeview");
    let context = new SearchContext(tree);
    let shelf_list = $("#shelfList");

    shelf_list.selectric({inheritOriginalWidth: true});

    var btn = document.getElementById("btnLoad");
    btn.onclick = function () {
        loadShelves(context, tree);
    };

    var btn = document.getElementById("btnSet");
    btn.onclick = function () {
        browser.tabs.create({
            "url": "options.html"
        });
    };

    var btn = document.getElementById("btnHelp");
    btn.onclick = function () {
        browser.tabs.create({
            "url": "options.html#help"
        });
    };

    shelf_list.change(function () {
        styleBuiltinShelf();
        switchShelf(context, tree, this.value);
    });

    $("#shelf-menu-button").click(() => {
        $("#search-mode-menu").hide();
        $("#shelf-menu").toggle();
    });

    $("#shelf-menu-create").click(() => {
        // TODO: i18n
        showDlg("prompt", {caption: "Create Shelf", label: "Name"}).then(data => {
            let name;
            if (name = data.title) {
               // let existingOption = $(`#shelfList option:contains("${name}")`);
                let selectedOption = $(`#shelfList option[value='${shelf_list.val()}']`);

                if (!isSpecialShelf(name)) {
                    backend.createGroup(null, name, NODE_TYPE_SHELF).then(shelf => {
                        if (shelf) {
                            selectedOption.removeAttr("selected");
                            $("<option></option>").appendTo(shelf_list)
                                .html(shelf.name)
                                .attr("value", shelf.id)
                                .attr("selected", true);

                            shelf_list.selectric('refresh');
                            switchShelf(context, tree, shelf.id);
                            invalidateCompletion();
                        }
                    });
                }
                else {
                    showNotification({message: "Can not create shelf with this name."})
                }
            }
        });
    });

    $("#shelf-menu-rename").click(() => {
        let selectedOption = $(`#shelfList option[value='${shelf_list.val()}']`);
        let id = parseInt(selectedOption.val());
        let name = selectedOption.text();

        if (name && !isSpecialShelf(name)) {
            // TODO: 118n
            showDlg("prompt", {caption: "Rename", label: "Name", title: name}).then(data => {
                let newName;
                if (newName = data.title) {
                    backend.renameGroup(id, newName).then(() => {
                            selectedOption.text(newName);
                            tree.renameRoot(newName)

                            shelf_list.selectric('refresh');
                            invalidateCompletion()
                        });
                }
            });
        } else if (name === DEFAULT_SHELF_NAME) {
            // TODO: i18n
            showNotification({message: "A built-in shelf could not be renamed."});
        }

    });

    $("#shelf-menu-delete").click(() => {
        let {id, name} = getCurrentShelf();

        if (isSpecialShelf(name)) {
            // TODO: i18n
            showNotification({message: "A built-in shelf could not be deleted."})
            return;
        }

        // TODO: 118n
        confirm("{Warning}", "Do you really want to delete '" + name + "'?").then(() => {
            if (name) {
                backend.deleteNodes(id).then(() => {
                    $(`#shelfList option[value="${id}"]`).remove();

                    shelf_list.val(1);
                    shelf_list.selectric('refresh');
                    switchShelf(context, tree, 1);
                    invalidateCompletion();
                });
            }
        });
    });

    tree.onRenameShelf = node => {
        if (isSpecialShelf(node.name)) {
            // TODO: i18n
            showNotification({message: "A built-in shelf could not be renamed."});
            return;
        }

        let node_id = node.id;
        tree._jstree.edit(node_id, null, (node, success, cancelled) => {
            if (success && !cancelled)
                backend.renameGroup(node_id, node.text).then(() => {
                    tree._jstree.rename_node(node.id, node.text);
                    $(`#shelfList option[value="${node_id}"]`).text(node.text);

                    shelf_list.selectric('refresh');
                    invalidateCompletion();
                });
        });
    };

    tree.onDeleteShelf = node => {
        if (isSpecialShelf(node.name)) {
            // TODO: i18n
            showNotification({message: "A built-in shelf could not be deleted."});
            return;
        }

        // TODO: 118n
        confirm("{Warning}", "Do you really want to delete '" + node.name + "'?").then(() => {
            if (node.name) {
                backend.deleteNodes(node.id).then(() => {
                    tree._jstree.delete_node(node.id);
                    
                    $(`#shelfList option[value="${node.id}"]`).remove();
                    shelf_list.selectric('refresh'); 

                    if (!tree._everything) {
                        shelf_list.val(1);
                        shelf_list.selectric('refresh');
                        switchShelf(context, tree, 1);
                        invalidateCompletion();
                    }
                });
            }
        });
    };

    $("#shelf-menu-import").click(() => {
        $("#file-picker").click();
    });

    $("#file-picker").change((e) => {
        if (e.target.files.length > 0) {
            let {name, ext} = pathToNameExt($("#file-picker").val());

            if (name === DEFAULT_SHELF_NAME || name === EVERYTHING || !isSpecialShelf(name)) {
                let existingOption = $(`#shelfList option:contains("${name}")`);

                if (existingOption.length)
                    confirm("{Warning}", "This will replace '" + name + "'.").then(() => {
                        (name === EVERYTHING
                            ? backend.wipeEveritying()
                            : (name === DEFAULT_SHELF_NAME
                                ? backend.deleteChildNodes(parseInt(existingOption.val()))
                                : backend.deleteNodes(parseInt(existingOption.val()))))

                            .then(() => {
                                performImport(context, tree, e.target.files[0], name, ext).then(() => {
                                    $("#file-picker").val("");
                                });
                        });
                    });
                else
                    performImport(context, tree, e.target.files[0], name, ext).then(() => {
                        $("#file-picker").val("");
                    });
            }
            else
                showNotification({message: `Cannot replace '${name}'.`});
        }
    });

    $("#shelf-menu-export").click(() => {
        performExport(context, tree);
    });


    $("#search-mode-switch").click(() => {
        $("#shelf-menu").hide();
        $("#search-mode-menu").toggle();
    });


    // $("#shelf-menu-search-everything").click(() => {
    //     $("#search-mode-switch").prop("src", "icons/catalogue.svg");
    //     context.setMode(SEARCH_MODE_SCRAPYARD, getCurrentShelf().name);
    //     performSearch(context, tree);
    // });

    $("#shelf-menu-search-title").click(() => {
        $("#search-mode-switch").prop("src", "icons/bookmark.svg");
        context.setMode(SEARCH_MODE_TITLE, getCurrentShelf().name);
        performSearch(context, tree);
    });

    $("#shelf-menu-search-content").click(() => {
        $("#search-mode-switch").prop("src", "icons/text.svg");
        context.setMode(SEARCH_MODE_CONTENT, getCurrentShelf().name);
        performSearch(context, tree);
    });

    $("#shelf-menu-search-tags").click(() => {
        $("#search-mode-switch").prop("src", "icons/tags.svg");
        context.setMode(SEARCH_MODE_TAGS, getCurrentShelf().name);
        performSearch(context, tree);
    });

    $("#shelf-menu-search-firefox").click(() => {
        $("#search-mode-switch").prop("src", "icons/firefox.svg");
        context.setMode(SEARCH_MODE_FIREFOX, getCurrentShelf().name);
        performSearch(context, tree);
    });

    let timeout;
    $("#search-input").on("input", e => {
        clearTimeout(timeout);

        if (e.target.value) {
            $("#search-input-clear").show();
            timeout = setTimeout(() => {
                performSearch(context, tree);
            }, INPUT_TIMEOUT);
        }
        else {
            timeout = null;
            performSearch(context, tree);
            $("#search-input-clear").hide();
        }
    });

    $("#search-input-clear").click(e => {
        $("#search-input").val("");
        $("#search-input-clear").hide();
        $("#search-input").trigger("input");
    });

    $(document).on("click", function(e) {
        if (!event.target.matches("#shelf-menu-button")
               && !event.target.matches("#search-mode-switch"))
            $(".simple-menu").hide();
    });


    browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === "BOOKMARK_CREATED") {
            if (settings.switch_to_new_bookmark())
                backend.computePath(request.node.id).then(path => {
                    settings.last_shelf(path[0].id);
                    loadShelves(context, tree).then(() => {
                        tree._jstree.deselect_all(true);
                        tree._jstree.select_node(request.node.id);
                    });
                });

            invalidateCompletion();
        }
    });

    browser.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
        switch (message.type) {
            case "SCRAPYARD_SWITCH_SHELF":
                backend.queryShelf(message.name).then(shelf => {
                    if (shelf) {
                        shelf_list.val(shelf.id);
                        shelf_list.selectric("refresh");
                        switchShelf(context, tree, shelf.id);
                    }
                    else {
                        if (!isSpecialShelf(message.name)) {
                            backend.createGroup(null, message.name, NODE_TYPE_SHELF).then(shelf => {
                                if (shelf) {
                                    $("<option></option>").appendTo(shelf_list)
                                        .html(shelf.name)
                                        .attr("value", shelf.id)
                                        .attr("selected", true);

                                    shelf_list.selectric('refresh');
                                    shelf_list.val(shelf.id);
                                    switchShelf(context, tree, shelf.id);
                                }
                            });
                        }
                        else {
                            showNotification({message: "Can not create shelf with this name."});
                        }
                    }
                });
                break;
        }
    });

    settings.load(() => {
        loadShelves(context, tree);
    });
};



console.log("==> sidebar.js loaded");
