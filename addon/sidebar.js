import {settings} from "./settings.js"
import {backend} from "./backend.js"
import {BookmarkTree} from "./tree.js"
import {DEFAULT_SHELF_NAME, NODE_TYPE_GROUP, NODE_TYPE_SHELF} from "./db.js";
import {showDlg, alert, confirm} from "./dialog.js"


function loadShelves(tree) {
    var lastShelf = settings.last_shelf;
    if (!lastShelf)
        lastShelf = 1;

    $("#shelfList").html("");
    var saw = false;

    backend.listShelves().then(shelves => {
        $("#shelfList").find("option").remove()
        for (let shelf of shelves) {
            var $opt = $("<option></option>").appendTo($("#shelfList")).html(shelf.name).attr("value", shelf.id);
            if (!saw && typeof lastShelf != "undefined" && shelf.id == lastShelf) {
                saw = true;
                $opt.attr("selected", true);
            }
        }
        switchShelf(tree, $("#shelfList").val());
    });
}

function switchShelf(tree, shelf_id) {
    settings.set('last_shelf', shelf_id);

    let path = $(`#shelfList option[value="${shelf_id}"]`).text();

    backend.listNodes({
            path: path,
            depth: "root+subtree",
            order: "custom"
        }).then(nodes => {
            tree.update(nodes);
        });
}

function loadAll(tree) {
    loadShelves(tree);
    $("#shelfList").change(function () {
        switchShelf(tree, this.value);
    });
}

document.addEventListener('contextmenu', function (event) {
    if ($(".dlg-cover:visible").length)
        event.preventDefault()
    return false;
});

window.onload = function () {
    /* i18n */
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();

    let tree = new BookmarkTree("#treeview");

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
                    backend.createGroup(null, name, NODE_TYPE_SHELF).then(shelf => {
                        if (shelf) {
                            selectedOption.removeAttr("selected");
                            $("<option></option>").appendTo($("#shelfList"))
                                .html(shelf.name)
                                .attr("value", shelf.id)
                                .attr("selected", true);

                            switchShelf(tree, shelf.id);
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

        if (name && name !== DEFAULT_SHELF_NAME) {
            // TODO: 118n
            showDlg("prompt", {caption: "Rename", label: "Name", title: name}).then(data => {
                let newName;
                if (newName = data.title) {
                    backend.renameGroup(id, newName).then(() => {
                            selectedOption.html(newName);
                            tree.renameRoot(newName)
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
        let id = parseInt(selectedOption.val());
        let name = selectedOption.text();

        if (name === DEFAULT_SHELF_NAME) {
            // TODO: i18n
            alert("{Error}", "The 'default' shelf could not be deleted.")
            return;
        }

        // TODO: 118n
        confirm("{Warning}", "Do you really want to delete '" + name + "'?").then(() => {
            if (name) {
                backend.deleteNodes(id).then(() => {
                    switchShelf(tree, 1);
                    selectedOption.remove();
                });
            }
        });
    });


    $(document).on("click", function(e) {
        if (!event.target.matches("#shelf-menu-button"))
            $(".simple-menu").hide();
    });


    loadAll(tree);
};

console.log("==> sidebar.js loaded");
