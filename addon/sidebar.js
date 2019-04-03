import {settings} from "./settings.js"
import {backend} from "./backend.js"
import {BookmarkTree, TREE_STATE_PREFIX} from "./tree.js"
import {showDlg, alert, confirm} from "./dialog.js"
import {importOrg, exportOrg} from "./import.js";

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
    let reader = new FileReader();

    return new Promise((resolve, reject) => {
        reader.onload = function (re) {
            let importF;

            switch (file_ext.toUpperCase()) {
                case "ORG":
                    importF = () => {
                        return importOrg(file_name, re.target.result)
                    };
                    break;
            }

            if (importF)
                importF().then(() => {
                    backend.db.queryShelf(file_name).then(shelf => {
                        settings.set('last_shelf', shelf.id);
                        loadShelves(context, tree).then(() => {
                            tree.openRoot();
                            resolve();
                        });
                    });
                })
        };

        reader.readAsText(file);
    });
}

function performExport(context, tree) {
    let {name} = getCurrentShelf();
    return exportOrg(tree, name).then(url => {
        browser.downloads.download({url: url, filename: name + ".org", saveAs: false});
    });
}

function loadShelves(context, tree) {
    $("#shelfList").html(`
        <option class="option-builtin" value="${TODO_SHELF}">${TODO_NAME}</option>
        <option class="option-builtin" value="${DONE_SHELF}">${DONE_NAME}</option>
        <option class="option-builtin divide" value="${EVERYTHING_SHELF}">${EVERYTHING}</option>
    `);

    return backend.listShelves().then(shelves => {
        for (let shelf of shelves)
            var $opt = $("<option></option>").appendTo($("#shelfList")).html(shelf.name).attr("value", shelf.id);

        var last_shelf_id = settings.last_shelf;

        if (!last_shelf_id)
            last_shelf_id = 1;

        let last_shelf = $(`#shelfList option[value="${last_shelf_id}"]`);
        last_shelf = last_shelf? last_shelf: $(`#shelfList option[value="1"]`);
        last_shelf.attr("selected", true);

        $("#shelfList").selectric('refresh');

        return switchShelf(context, tree, $("#shelfList").val());
    });
}

function switchShelf(context, tree, shelf_id) {
    let path = $(`#shelfList option[value="${shelf_id}"]`).text();

    settings.set('last_shelf', shelf_id);

    context.shelfName = path;

    if (canSearch())
        return performSearch(context, tree);
    else {
        if (shelf_id == TODO_SHELF) {
            tree.stateKey = TREE_STATE_PREFIX + TODO_NAME;
            return backend.listTODO().then(nodes => {
                tree.list(nodes);
            });
        }
        else if (shelf_id == DONE_SHELF) {
            tree.stateKey = TREE_STATE_PREFIX + DONE_NAME;
            return backend.listDONE().then(nodes => {
                tree.list(nodes);
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

    $("#shelfList").selectric({inheritOriginalWidth: true});

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

    $("#shelfList").change(function () {
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
                let selectedOption = $(`#shelfList option[value='${$("#shelfList").val()}']`);

                if (!isSpecialShelf(name)) {
                    backend.createGroup(null, name, NODE_TYPE_SHELF).then(shelf => {
                        if (shelf) {
                            selectedOption.removeAttr("selected");
                            $("<option></option>").appendTo($("#shelfList"))
                                .html(shelf.name)
                                .attr("value", shelf.id)
                                .attr("selected", true);

                            $("#shelfList").selectric('refresh');
                            switchShelf(context, tree, shelf.id);
                        }
                    });
                }
                else {
                    alert("{Error}", "Can not create shelf with this name.")
                }
            }
        });
    });

    $("#shelf-menu-rename").click(() => {
        let selectedOption = $(`#shelfList option[value='${$("#shelfList").val()}']`);
        let id = parseInt(selectedOption.val());
        let name = selectedOption.text();

        if (name && name !== DEFAULT_SHELF_NAME && id > 0) {
            // TODO: 118n
            showDlg("prompt", {caption: "Rename", label: "Name", title: name}).then(data => {
                let newName;
                if (newName = data.title) {
                    backend.renameGroup(id, newName).then(() => {
                            selectedOption.html(newName);
                            tree.renameRoot(newName)

                            $("#shelfList").selectric('refresh');
                        });
                }
            });
        } else if (name === DEFAULT_SHELF_NAME) {
            // TODO: i18n
            alert("{Error}", "A builtin shelf could not be renamed.")
        }

    });

    $("#shelf-menu-delete").click(() => {
        let {id, name} = getCurrentShelf();

        if (name === DEFAULT_SHELF_NAME || id < 0) {
            // TODO: i18n
            alert("{Error}", "A builtin shelf could not be deleted.")
            return;
        }

        // TODO: 118n
        confirm("{Warning}", "Do you really want to delete '" + name + "'?").then(() => {
            if (name) {
                backend.deleteNodes(id).then(() => {
                    switchShelf(context, tree, 1);

                    $(`#shelfList option[value="${id}"]`).remove();
                    $(`#shelfList option[value='1']`).attr("selected", "true");

                    $("#shelfList").selectric('refresh');
                });
            }
        });
    });

    $("#shelf-menu-import").click(() => {
        $("#file-picker").click();
    });

    $("#file-picker").change((e) => {
        if (e.target.files.length > 0) {
            let fullPath = $("#file-picker").val();
            //$("#file-picker").val("");
            let startIndex = (fullPath.indexOf('\\') >= 0 ? fullPath.lastIndexOf('\\') : fullPath.lastIndexOf('/'));
            let dotIndex = fullPath.lastIndexOf('.');
            let filename = fullPath.substring(startIndex, dotIndex);
            let fileext = fullPath.substring(dotIndex + 1);

            if (filename.indexOf('\\') === 0 || filename.indexOf('/') === 0) {
                filename = filename.substring(1);
            }

            if (!isSpecialShelf(filename)) {
                let existingOption = $(`#shelfList option:contains("${filename}")`);

                if (existingOption.length)
                    confirm("{Warning}", "This will relpace shelf '" + filename + "'?").then(() => {
                        backend.deleteNodes(parseInt(existingOption.val())).then(() => {
                            performImport(context, tree, e.target.files[0], filename, fileext).then(() => {
                                $("#file-picker").val("");
                            });
                        });
                    });
                else {
                    performImport(context, tree, e.target.files[0], filename, fileext).then(() => {
                        $("#file-picker").val("");
                    });
                }
            }
            else
                alert("{Error}", `Cannot replace '${filename}' shelf.`)
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


    function handleMessage(request, sender, sendResponse) {
        if (request.type === "BOOKMARK_CREATED") {
            loadShelves(context, tree);
        }
    }

    browser.runtime.onMessage.addListener(handleMessage);

    loadShelves(context, tree);
};

console.log("==> sidebar.js loaded");
