import {send} from "../proxy.js"
import {backend} from "../backend.js";
import {settings} from "../settings.js";
import {fixDocumentEncoding, parseHtml} from "../utils_html.js";
import {getActiveTab} from "../utils_browser.js";
import {ShelfList} from "./shelf_list.js";

let shelfList;

window.onload = async function() {
    await settings.load();

    shelfList = new ShelfList("#search-scope", {
        maxHeight: settings.shelf_list_height() || settings.default.shelf_list_height
    });

    shelfList.initDefault();

    $("#search-button").on("click", e => performSearch());
    $("#search-query").on("keydown", e => {if (e.code === "Enter") performSearch();});
};

let searching;
let searchQuery;
let previewURL;
let resultsFound;

async function previewResult(query, node) {
    const blob = await backend.fetchBlob(node.id);
    const text = await backend.reifyBlob(blob);
    const doc = parseHtml(text);
    const mark = new Mark(doc.body);

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
            $(`#row_${node.id} .result-row`).css("background-color", "#DDDDDD");
            $("#search-preview").html(`<iframe class="search-preview-content" src="${previewURL}"></iframe>`);
        }
    });
}

async function appendSearchResult(query, node, occurrences) {
    const foundItems = $("#found-items");
    const fallbackIcon = "/icons/globe.svg";

    let icon = node.icon;
    if (node.stored_icon)
        icon = await backend.fetchIcon(node.id);

    if (!icon)
        icon = fallbackIcon;

    let html = `<tr  id="row_${node.id}">
                  <td class="result-actions">
                    <div class="cell-content">
                      <img id="select_${node.id}" class="result-action-icon" src="../icons/tree-select.svg" title="Select"/>
                      <img id="open_this_tab_${node.id}" class="result-action-icon" src="../icons/open-link-this-tab.svg" title="Open in this tab"/>
                      <img id="open_${node.id}" class="result-action-icon" src="../icons/open-link.svg" title="Open in new tab"/>&nbsp;
                    </div>
                  </td>
                  <td id="item_${node.id}" class="search-result result-row">
                   <div class="cell-content">
                      <img id="icon_${node.id}" class="result-icon" src="${icon}"/>
                     <span id="title_${node.id}" class="result-title">${node.name}</span>
                   </div>
                 </td>
                 <td id="occurrences_${node.id}" class="occurrences result-row">
                   <div class="cell-content">${occurrences} ${occurrences === 1 ? " occurrence" : " occurrences"}</div>
                 </td>
               </tr>`;

    foundItems.append(html);

    if (!node.stored_icon && node.icon) {
        let image = new Image();
        image.onerror = e => {
            $(`#icon_${node.id}`).prop("src", fallbackIcon);
        };
        image.src = icon;
    }

    $(`#item_${node.id}`).click(e => previewResult(query, node));
    $(`#occurrences_${node.id}`).click(e => previewResult(query, node));
    $(`#select_${node.id}`).click(e => send.selectNode({node}));
    $(`#open_this_tab_${node.id}`).click(async e => send.browseNode({node, tab: await getActiveTab(), preserveHistory: true}));
    $(`#open_${node.id}`).click(e => send.browseNode({node}));

    $("#search-result-count").text(`${++resultsFound} ${resultsFound === 1? "result": "results"} found`);
}

function markSearch(query, nodes, across, callback) {
    if (!nodes.length || !searching) {
        callback()
        return;
    }

    let node = nodes.shift();

    backend.fetchBlob(node.id)
        .then(blob => {
            backend.reifyBlob(blob)
                .then(text => {
                    let doc = parseHtml(text);
                    let mark = new Mark(doc);
                    let found = true;

                    mark.mark(query, {
                        iframes: true,
                        acrossElements: across,
                        //firstMatchOnly: true,
                        separateWordSearch: false,
                        ignorePunctuation: ",-–—‒'\"+=".split(""),
                        //filter: (n, t, c) => {return c === 0},
                        noMatch: () => {found = false;},
                        done: c => {
                            if (found && searching) {
                                appendSearchResult(query, node, c);
                            }
                            markSearch(query, nodes, across, callback);
                        }
                    });
                });
        });
}

async function performSearch() {
    if (!searching) {
        searchQuery = $("#search-query").val().trim();

        if (!searchQuery)
            return;

        searching = true;
        $("#search-button").val("Cancel");

        resultsFound = 0;
        $("#search-result-count").text("");

        $("title").text("Full Text Search: " + searchQuery);

        const nodes = await backend.listNodes({
            search: searchQuery,
            content: true,
            index: "content",
            path: shelfList.selectedShelfName
        });

        $("#found-items").empty();
        $("#search-preview").empty();

        markSearch(searchQuery, nodes, searchQuery.indexOf(" ") > 0, () => {
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
