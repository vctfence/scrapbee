import {
    EVERYTHING_SHELF_ID,
} from "./storage_constants.js";
import {settings} from "./settings.js";
import {backend} from "./backend.js";
import {fixDocumentEncoding, loadShelveOptions, parseHtml} from "./utils.js"
import {send} from "./proxy.js"

window.onload = async function() {

    await loadShelveOptions("#search-scope");

    $("#search-button").on("click", e => performSearch());
    $("#search-query").on("keydown", e => {if (e.code === "Enter") performSearch();});

};

let searching;
let searchQuery;
let previewURL;
let resultsFound;

async function selectResult(node) {

}

async function previewResult(query, node) {
    const blob = await backend.fetchBlob(node.id);
    let doc = parseHtml(blob.data);
    let mark = new Mark(doc.body);

    mark.mark(query, {
        iframes: true,
        acrossElements: true,
        separateWordSearch: false,
        ignorePunctuation: ",-–—‒'\"+=".split(""),
        done: () => {
            fixDocumentEncoding(doc);
            $(doc.head).append("<style>mark {background-color: #ffff00 !important;}</style>");
            let html = doc.documentElement.outerHTML;

            if (previewURL)
                URL.revokeObjectURL(previewURL);

            let object = new Blob([html], {type: "text/html"});
            previewURL = URL.createObjectURL(object);

            $(`#found-items td`).css("background-color", "transparent");
            $(`#item_${node.id}`).css("background-color", "#DDDDDD");
            $("#search-preview").html(`<iframe class="search-preview-content" src="${previewURL}"></iframe>`);
        }
    });
}

async function appendSearchResult(query, node, occurrences) {
    const foundItems = $("#found-items");
    const fallbackIcon = "icons/globe.svg";

    let icon = node.icon;
    if (node.stored_icon)
        icon = await backend.fetchIcon(node.id);

    if (!icon)
        icon = fallbackIcon;

    let html = `<tr  id="row_${node.id}">
                    <td><img id="select_${node.id}" class="result-action-icon" src="icons/tree-select.svg" title="Select"/>
                    <img id="open_${node.id}" class="result-action-icon" src="icons/open-link.svg" title="Open"/>`;

    html += `&nbsp;
             </td><td id="item_${node.id}" class="found-result"><img id="icon_${node.id}" class="result-icon" src="${icon}"/>
             <span id="title_${node.id}" class="result-title">${node.name}</span></td>
             <td class="occurrences">${occurrences} ${occurrences === 1? " occurrence": " occurrences"}</td></tr>`

    foundItems.append(html);

    if (!node.stored_icon && node.icon) {
        let image = new Image();
        image.onerror = e => {
            $(`#icon_${node.id}`).prop("src", fallbackIcon);
        };
        image.src = icon;
    }

    $(`#item_${node.id}`).click(e => previewResult(query, node));
    $(`#select_${node.id}`).click(e => send.selectNode({node}));
    $(`#open_${node.id}`).click(e => send.browseNode({node}));

    $("#search-result-count").text(`${++resultsFound} ${resultsFound === 1? "result": "results"} found`);
}

function markSearch(query, nodes, callback) {
    if (!nodes.length || !searching) {
        callback()
        return;
    }

    let node = nodes.shift();

    backend.fetchBlob(node.id)
        .then(blob => {
            let doc = parseHtml(blob.data);
            let mark = new Mark(doc);
            let found = true;

            mark.mark(query, {
                iframes: true,
                acrossElements: true,
                //firstMatchOnly: true,
                separateWordSearch: false,
                ignorePunctuation: ",-–—‒'\"+=".split(""),
                //filter: (n, t, c) => {return c === 0},
                noMatch: () => {found = false;},
                done: c => {
                    if (found && searching) {
                        appendSearchResult(query, node, c);
                    }
                    markSearch(query, nodes, callback);
                }
            });
        });
}

async function performSearch() {
    if (!searching) {
        searchQuery = $("#search-query").val();

        if (!searchQuery)
            return;

        searching = true;
        $("#search-button").val("Cancel");

        resultsFound = 0;
        $("#search-result-count").text("");

        $("title").text("Full Text Search: " + searchQuery);

        let nodes;

        if ($("#search-scope").val() !== EVERYTHING_SHELF_ID.toString())
            nodes = await backend.listShelfNodes($("#search-scope option:selected").text())

        nodes = await backend.filterByContent(nodes, searchQuery.indexWords());

        $("#found-items").empty();

        markSearch(searchQuery, nodes, () => {
            searching = false;
            $("#search-button").val("Search");

            if (resultsFound === 0)
                $("#search-result-count").text(`not found`);

            if (searchQuery !== $("#search-query").val())
                performSearch();
        });
    }
    else {
        searching = false;
    }

}
