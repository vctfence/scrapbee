import {send} from "../proxy.js"
import {settings} from "../settings.js";
import {
    fixDocumentEncoding,
    instantiateIFramesRecursive,
    parseHtml,
    rebuildIFramesRecursive
} from "../utils_html.js";
import {getActiveTab, injectScriptFile} from "../utils_browser.js";
import {ShelfList} from "./shelf_list.js";
import {Bookmark} from "../bookmarks_bookmark.js";
import {Archive, Icon} from "../storage_entities.js";
import {systemInitialization} from "../bookmarks_init.js";
import {ProgressCounter, sleep} from "../utils.js";

const IGNORE_PUNCTUATION = ",-–—‒'\"+=".split("");

let shelfList;

window.addEventListener('DOMContentLoaded', () => {
    const searchScopePlaceholderDiv = $("#search-scope-placeholder");
    searchScopePlaceholderDiv.css("width", ShelfList.getStoredWidth("fulltext") || ShelfList.DEFAULT_WIDTH);
    searchScopePlaceholderDiv.show();
});

$(init);

async function init() {
    await systemInitialization;

    shelfList = new ShelfList("#search-scope", {
        maxHeight: settings.shelf_list_height() || settings.default.shelf_list_height,
        _prefix: "fulltext"
    });

    await shelfList.initDefault()

    $("#search-button").on("click", e => performSearch());
    $("#search-query").on("keydown", e => {if (e.originalEvent.code === "Enter") performSearch();});
}

let searching;
let searchQuery;
let previewURL;
let resultsFound;

async function previewResult(query, node) {
    const archive = await Archive.get(node.id);
    const content = await Archive.reify(archive);
    const doc = parseHtml(content);
    const [iframeDocs, topIframes] = instantiateIFramesRecursive(doc);
    const mark = new Mark(doc.body);

    for (const iframeDoc of iframeDocs)
        await markDoc(query, iframeDoc)

    rebuildIFramesRecursive(doc, topIframes);

    mark.mark(query, {
        iframes: true,
        acrossElements: true,
        separateWordSearch: false,
        ignorePunctuation: IGNORE_PUNCTUATION,
        done: () => displayDocument(doc, node)
    });
}

function displayDocument(doc, node) {
    fixDocumentEncoding(doc);
    $(doc.head).append("<style>mark {background-color: #ffff00 !important;}</style>");
    let html = doc.documentElement.outerHTML;

    if (previewURL)
        URL.revokeObjectURL(previewURL);

    let object = new Blob([html], {type: "text/html"});
    previewURL = URL.createObjectURL(object);
    displayURL(previewURL, node);
}

function displayURL(previewURL, node) {
    $(`#found-items td`).css("background-color", "transparent");
    $(`#row_${node.id} .result-row`).css("background-color", "#DDDDDD");
    $("#search-preview").html(`<iframe class="search-preview-content" src="${previewURL}"></iframe>`);
}

async function markDoc(query, doc) {
    const mark = new Mark(doc);

    let resolveResult;
    const promise = new Promise(resolve => resolveResult = resolve);

    mark.mark(query, {
        iframes: true,
        acrossElements: true,
        separateWordSearch: false,
        ignorePunctuation: IGNORE_PUNCTUATION,
        done: () => resolveResult()
    });

    return promise;
}

async function appendSearchResult(query, node, occurrences) {
    const foundItems = $("#found-items");
    const fallbackIcon = "/icons/globe.svg";

    let icon = node.icon;
    if (node.stored_icon)
        icon = await Icon.get(node.id);

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

async function markSearch(query, nodes, acrossElements) {
    if (!nodes.length || !searching)
        return;

    const progressCounter = new ProgressCounter(nodes.length, "fullTextSearchProgress");

    for (const node of nodes) {
        if (!searching)
            break;

        const docs = await getArchiveFrames(node);

        let total = 0;
        for (const doc of docs) {
            if (!searching)
                break;

            const count = await markSearchDoc(query, doc, acrossElements);

            if (count)
                total += count;

            progressCounter.incrementAndNotify();
        }

        if (total > 0)
            await appendSearchResult(query, node, total);
    }

    stopSearch(progressCounter);
}

async function getArchiveFrames(node) {
    const archive = await Archive.get(node.id);
    const content = await Archive.reify(archive);
    const rootDoc = parseHtml(content);
    const [iframeDocs] = instantiateIFramesRecursive(rootDoc);
    return [rootDoc, ...iframeDocs];
}

async function markSearchDoc(query, doc, across) {
    const mark = new Mark(doc);
    let found = true;

    let resolveResult;
    const promise = new Promise(resolve => resolveResult = resolve);

    mark.mark(query, {
        iframes: true,
        acrossElements: across,
        //firstMatchOnly: true,
        separateWordSearch: false,
        ignorePunctuation: IGNORE_PUNCTUATION,
        //filter: (n, t, c) => {return c === 0},
        noMatch: () => {
            found = false;
        },
        done: c => {
            if (found)
                resolveResult(c);
            else
                resolveResult(0);
        }
    });

    return promise;
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

        send.startProcessingIndication({noWait: true});

        const nodes = await Bookmark.list({
            search: searchQuery,
            content: true,
            index: "content",
            partial: true,
            order: "date_desc",
            path: shelfList.selectedShelfName
        });

        $("#found-items").empty();
        $("#search-preview").empty();

        markSearch(searchQuery, nodes, searchQuery.indexOf(" ") > 0);
    }
    else
        searching = false;
}

function stopSearch(progressCounter) {
    searching = false;
    $("#search-button").val("Search");
    send.stopProcessingIndication();
    progressCounter.finish();

    if (resultsFound === 0)
        $("#search-result-count").text(`not found`);

    if (searchQuery !== $("#search-query").val())
        performSearch();
}
