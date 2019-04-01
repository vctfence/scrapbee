import {settings} from "./settings.js"
import {backend} from "./backend.js"
import {BookmarkTree, TREE_STATE_PREFIX} from "./tree.js"
import {showDlg, alert, confirm} from "./dialog.js"
import {importOrg} from "./import.js";

import {
    EVERYTHING,
    DEFAULT_SHELF_NAME,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    TODO_SHELF,
    DONE_SHELF,
    EVERYTHING_SHELF
} from "./db.js";

import {
    SEARCH_MODE_SCRAPYARD,
    SEARCH_MODE_TITLE,
    SEARCH_MODE_TAGS,
    SEARCH_MODE_CONTENT,
    SEARCH_MODE_FIREFOX,
    SearchContext

} from "./search.js";


const INPUT_TIMEOUT = 1000;

function validSearchInput(input) {
    return input && input.length > 2;
}

function canSearch() {
    let input = $("#search-input").val();

    return validSearchInput(input);
}

async function performSearch(context, tree) {
    let input = $("#search-input").val();

    if (validSearchInput(input) && !context._previous_input) {
        context.save();
    }
    else if (!validSearchInput(input) && context._previous_input) {
        context.restore();
    }

    context._previous_input = input;

    if (validSearchInput(input))
        return context.search(input).then(nodes => {
            tree.list(nodes);
        });
}

function loadShelves(context, tree) {
    var lastShelf = settings.last_shelf;
    if (!lastShelf)
        lastShelf = 1;

    $("#shelfList").html(`
        <option class="option-builtin" value="${TODO_SHELF}">TODO</option>
        <option class="option-builtin" value="${DONE_SHELF}">DONE</option>
        <option class="option-builtin divide" value="${EVERYTHING_SHELF}">everything</option>
    `);
    var saw = false;

    return backend.listShelves().then(shelves => {
        for (let shelf of shelves) {
            var $opt = $("<option></option>").appendTo($("#shelfList")).html(shelf.name).attr("value", shelf.id);
            if (!saw && typeof lastShelf != "undefined" && shelf.id == lastShelf) {
                saw = true;
                $opt.attr("selected", true);
            }
        }
        $("#shelfList").selectric('refresh');
        return switchShelf(context, tree, $("#shelfList").val());
    });
}

function switchShelf(context, tree, shelf_id) {
    let path = $(`#shelfList option[value="${shelf_id}"]`).text();

    settings.set('last_shelf', shelf_id);

    context.shelfName = path;

    console.log(shelf_id);

    if (canSearch())
        return performSearch(context, tree);
    else {
        if (shelf_id == EVERYTHING_SHELF)
            return backend.listNodes({
                order: "custom"
            }).then(nodes => {
                tree.update(nodes, true);
            });
        else
        return backend.listNodes({
                path: path,
                depth: "root+subtree",
                order: "custom"
            }).then(nodes => {
                tree.update(nodes);
            });
    }
}

document.addEventListener('contextmenu', function (event) {
    if ($(".dlg-cover:visible").length)
        event.preventDefault()
    return false;
});

function getCurrentShelf() {
    let selectedOption = $("#shelfList option:selected");
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
                let existingOption = $(`#shelfList option:contains("${name}")`);
                let selectedOption = $("#shelfList option:selected");

                if (existingOption.length) {
                    selectedOption.removeAttr("selected");
                    existingOption.attr("selected", true);
                }

                if (name !== DEFAULT_SHELF_NAME) {
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
            }
        });
    });

    $("#shelf-menu-rename").click(() => {
        let selectedOption = $("#shelfList option:selected");
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
            let reader = new FileReader();
            reader.onload = function (re) {
                let fullPath = $("#file-picker").val();
                $("#file-picker").val("");
                let startIndex = (fullPath.indexOf('\\') >= 0 ? fullPath.lastIndexOf('\\') : fullPath.lastIndexOf('/'));
                let dotIndex = fullPath.lastIndexOf('.');
                let filename = fullPath.substring(startIndex, dotIndex);

                if (filename.indexOf('\\') === 0 || filename.indexOf('/') === 0) {
                    filename = filename.substring(1);
                }

                importOrg(filename, re.target.result).then(() => {
                    loadShelves(context, tree).then(() => {
                        let existingOption = $(`#shelfList option:contains("${filename}")`);
                        let selectedOption = $("#shelfList option:selected");

                        if (existingOption.length) {
                            selectedOption.removeAttr("selected");
                            existingOption.attr("selected", true);
                        }
                        console.log(tree)
                        switchShelf(context, tree, existingOption.val()).then(() => {
                            tree.openRoot();
                        });
                    });
                });
            };
            reader.readAsText(e.target.files[0]);
        }
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
        if (e.target.value)
            $("#search-input-clear").show();
        else
            $("#search-input-clear").hide();

        clearTimeout(timeout);
        timeout = setTimeout(() => {
            performSearch(context, tree);
        }, INPUT_TIMEOUT);
    });

    $("#search-input-clear").click(e => {
        $("#search-input").val("");
        $("#search-input-clear").hide();
        performSearch(context, tree);
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
