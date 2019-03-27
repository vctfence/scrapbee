import {settings} from "./settings.js"
import {backend} from "./backend.js"
import {BookmarkTree} from "./tree.js"
import {DEFAULT_SHELF_NAME, NODE_TYPE_GROUP, NODE_TYPE_SHELF} from "./db.js";
import {showDlg, alert, confirm} from "./dialog.js"
import {importOrg} from "./import.js";


function loadShelves(tree) {
    var lastShelf = settings.last_shelf;
    if (!lastShelf)
        lastShelf = 1;

    $("#shelfList").html("");
    var saw = false;

    return backend.listShelves().then(shelves => {
        $("#shelfList").find("option").remove()
        for (let shelf of shelves) {
            var $opt = $("<option></option>").appendTo($("#shelfList")).html(shelf.name).attr("value", shelf.id);
            if (!saw && typeof lastShelf != "undefined" && shelf.id == lastShelf) {
                saw = true;
                $opt.attr("selected", true);
            }
        }
        return switchShelf(tree, $("#shelfList").val());
    });
}

function switchShelf(tree, shelf_id) {
    settings.set('last_shelf', shelf_id);

    let path = $(`#shelfList option[value="${shelf_id}"]`).text();

    return backend.listNodes({
            path: path,
            depth: "root+subtree",
            order: "custom"
        }).then(nodes => {
            tree.update(nodes);
        });
}

function loadAll(tree) {
    return loadShelves(tree);
}

document.addEventListener('contextmenu', function (event) {
    if ($(".dlg-cover:visible").length)
        event.preventDefault()
    return false;
});

let tree;

window.onload = function () {
    /* i18n */
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();

    tree = new BookmarkTree("#treeview");

    // var btn = document.getElementById("btnLoad");
    // btn.onclick = function () {
    //     loadShelves();
    // };
    // var btn = document.getElementById("btnSearch");
    // btn.onclick = function () {
    //     browser.tabs.create({
    //         "url": "search.html"
    //     });
    // }
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

    $("#shelfList").change(function () {
        switchShelf(tree, this.value);
    });

    $("#shelf-menu-button").click(() => {
        $("#shelf-menu").toggle()
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
            alert("{Error}", "The shelf 'default' could not be deleted.")
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
                    loadShelves(tree).then(() => {
                        let existingOption = $(`#shelfList option:contains("${filename}")`);
                        let selectedOption = $("#shelfList option:selected");

                        if (existingOption.length) {
                            selectedOption.removeAttr("selected");
                            existingOption.attr("selected", true);
                        }
                        switchShelf(tree, existingOption.val()).then(() => {
                            tree.openRoot();
                        });
                    });
                });
            };
            reader.readAsText(e.target.files[0]);
        }
    });


    $(document).on("click", function(e) {
        if (!event.target.matches("#shelf-menu-button"))
            $(".simple-menu").hide();
    });


    loadAll(tree);
};

function handleMessage(request, sender, sendResponse) {
    if (request.id === "NEW_IMPORT") {

    }
}

browser.runtime.onMessage.addListener(handleMessage);

console.log("==> sidebar.js loaded");
