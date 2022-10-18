import {send} from "../../proxy.js";
import {isBuiltInShelf} from "../../storage.js";
import {showNotification} from "../../utils_browser.js";
import {Query} from "../../storage_query.js";
import {ensureSidebarWindow} from "../../utils_sidebar.js";
import {simpleSelectric} from "../shelf_list.js";
import {settings} from "../../settings.js";

const RDF_IMPORT_THREADS = 5;

let importing = false;
async function onStartRDFImport(e) {
    let finalize = () => {
        $("#start-rdf-import").val("Import");
        $("#rdf-shelf-name").prop('disabled', false);
        $("#rdf-import-path").prop('disabled', false);
        //$("#rdf-import-threads").prop('disabled', false);

        $("#rdf-progress-row").text("Ready");
        importing = false;
        browser.runtime.onMessage.removeListener(importListener);
    };

    let shelf = $("#rdf-shelf-name").val();
    let path = $("#rdf-import-path").val();

    if (importing) {
        send.cancelRdfImport();
        finalize();
        return;
    }

    if (settings.platform.chrome && $("#rdf-import-type").val() === "rdf-open") {
        showNotification({message: "RDF editing is only available on firefox."});
        return;
    }

    if (!shelf || !path) {
        showNotification({message: "Please, specify all import parameters."});
        return;
    }

    let shelf_node = await Query.shelf(shelf);
    if (isBuiltInShelf(shelf) || shelf_node) {
        showNotification({message: "The specified shelf already exists."});
        return;
    }

    importing = true;
    $("#start-rdf-import").val("Cancel");
    $("#rdf-shelf-name").prop('disabled', true);
    $("#rdf-import-path").prop('disabled', true);
    //$("#rdf-import-threads").prop('disabled', true);

    let progressRow = $("#rdf-progress-row");

    progressRow.text("initializing bookmark directory structure...");
    //$("#rdf-import-progress").val(0);
    //$("#rdf-progress-row").show();

    let runningProgress = 0;

    let importListener = message => {
        if (message.type === "rdfImportProgress") {
            let bar = $("#rdf-import-progress");
            if (!bar.length) {
                bar = $(`<progress id="rdf-import-progress" max="100" value="0"/>`);
                progressRow.empty().append(bar);
            }
            if (message.progress > runningProgress) {
                runningProgress = message.progress;
                bar.val(message.progress);
            }
        }
        else if (message.type === "rdfImportError") {
            let invalid_link = `<a href="#" target="_blank" data-id="${message.bookmark.id}"
                                       class="invalid-import">${message.bookmark.name}</a>`;
            $("#invalid-imports-container").show();
            $("#invalid-imports").append(`<tr><td>${message.error}</td><td>${invalid_link}</td></tr>`);
        }
        else if (message.type === "obtainingIcons") {
            progressRow.text("Obtaining page icons...");
        }
    };

    browser.runtime.onMessage.addListener(importListener);

    if (!_BACKGROUND_PAGE)
        await ensureSidebarWindow(1000);

    send.importFile({
        file: path,
        file_name: shelf,
        file_ext: "RDF",
        threads: RDF_IMPORT_THREADS,
        quick: $("#rdf-import-type").val() === "rdf-open",
        createIndex: $("#rdf-import-create-search-index").is(":checked")
    }).then(finalize)
      .catch(e => {
          showNotification({message: e.message});
          finalize();
      });
}

function selectNode(e) {
    e.preventDefault();
    send.selectNode({node: {id: parseInt(e.target.getAttribute("data-id"))}});
}

export function load() {
    simpleSelectric("#rdf-import-type");

    $("#rdf-import-type").on("change", e => {
        if ($(e.target).val() === "rdf-open") {
            $("#rdf-import-create-search-index")
                //.prop("checked", false)
                .prop("disabled", false)
        }
        else {
            $("#rdf-import-create-search-index")
                .prop("checked", true)
                .prop("disabled", true)
        }
    });

    $("#invalid-imports-container").on("click", ".invalid-import", selectNode);
    $("#start-rdf-import").on("click", onStartRDFImport);
}
