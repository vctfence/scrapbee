import {backend} from "./backend.js"
import {TREE_STATE_PREFIX} from "./tree.js";
import {ENDPOINT_TYPES, EVERYTHING, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "./storage_constants.js";
import {openContainerTab} from "./utils_browser.js";


export const SEARCH_MODE_TITLE = 1;
export const SEARCH_MODE_TAGS = 2;
export const SEARCH_MODE_CONTENT = 3;
export const SEARCH_MODE_NOTES = 4;
export const SEARCH_MODE_COMMENTS = 5;
export const SEARCH_MODE_DATE = 6;


class SearchProvider {
    constructor(shelf) {
        this.shelf = shelf;
    }

    isInputValid(text) {
        return text && text.length > 2;
    }
}

export class TitleSearchProvider extends SearchProvider {
    constructor(shelf) {
        super(shelf)
    }

    search(text, limit) {
        let path;
        if (this.shelf !== EVERYTHING)
            path = this.shelf;

        if (text)
            return backend.listNodes({
                search: text,
                depth: "subtree",
                path: path,
                limit: limit,
                types: ENDPOINT_TYPES
            });

        return [];
    }
}

export class TagSearchProvider extends SearchProvider {
    constructor(shelf) {
        super(shelf)
    }

    search(text) {
        let path;
        if (this.shelf !== EVERYTHING)
            path = this.shelf;

        if (text) {
            return backend.listNodes({
                depth: "subtree",
                path: path,
                tags: text,
                types: ENDPOINT_TYPES
            });
        }
        return [];
    }
}

export class ContentSearchProvider extends SearchProvider {
    constructor(shelf, index) {
        super(shelf);
        this.index = index;
    }

    search(text) {
        let path;
        if (this.shelf !== EVERYTHING)
            path = this.shelf;

        if (text) {
            return backend.listNodes({
                search: text,
                content: true,
                index: this.index,
                depth: "subtree",
                path: path
            });
        }
        return [];
    }
}

export class DateSearchProvider extends SearchProvider {
    constructor(shelf) {
        super(shelf)
    }

    search(text) {
        let path;
        if (this.shelf !== EVERYTHING)
            path = this.shelf;

        if (text) {
            const m = /(.*)(\d{4}-\d{2}-\d{2})/.exec(text.trim().toLowerCase());
            return backend.listNodes({
                depth: "subtree",
                path: path,
                date: m[2],
                period: m[1].trim(),
                types: ENDPOINT_TYPES
            });
        }
        return [];
    }

    isInputValid(text) {
        const daterx = /^(?:\d{4}-\d{2}-\d{2})|(?:before\s+\d{4}-\d{2}-\d{2})|(?:after\s+\d{4}-\d{2}-\d{2})$/i;

        if (super.isInputValid(text)) {
            text = text.trim()
            if (daterx.test(text)) {
                const m = /(.*)(\d{4}-\d{2}-\d{2})/.exec(text);

                if (!isNaN(new Date(m[2])))
                    return true;
            }
        }

        return false;
    }
}

export class SearchContext {
    constructor(tree) {
        this.tree = tree;
        this._previousInput = "";
        this.searchMode = SEARCH_MODE_TITLE;
        this.provider = new TitleSearchProvider(EVERYTHING);
    }

    inSearch() {
        this.isInSearch = true;
        this.tree.stateKey = TREE_STATE_PREFIX + "search-" + this.searchMode;
    }

    outOfSearch() {
        this.isInSearch = false;
    }

    get shelfName() {
        return this.shelf;
    }

    set shelfName(shelf) {
        this.shelf = shelf;
        this.setMode(this.searchMode, shelf);
    }

    setMode(search_mode, shelf) {
        this.searchMode = search_mode;
        this.shelf = shelf;

        switch (search_mode) {
            case SEARCH_MODE_TITLE:
                this.provider = new TitleSearchProvider(shelf);
                break;
            case SEARCH_MODE_TAGS:
                this.provider = new TagSearchProvider(shelf);
                break;
            case SEARCH_MODE_CONTENT:
                this.provider = new ContentSearchProvider(shelf, "content");
                break;
            case SEARCH_MODE_NOTES:
                this.provider = new ContentSearchProvider(shelf, "notes");
                break;
            case SEARCH_MODE_COMMENTS:
                this.provider = new ContentSearchProvider(shelf, "comments");
                break;
            case SEARCH_MODE_DATE:
                this.provider = new DateSearchProvider(shelf);
                break;
        }
    }

    search(text) {
        return this.provider.search(text);
    }

    isInputValid(text) {
        return this.provider.isInputValid(text);
    }
}

// omnibox ////////////////////////////////////////////////////////////////////

export function initializeOmnibox() {
    browser.omnibox.setDefaultSuggestion({
        description: `Search Scrapyard bookmarks`
    });

    const SEARCH_LIMIT = 6;
    let suggestions;

    const makeSuggestion = function(node) {
        let suggestion = {__node: node, description: node.name};
        if (node.type === NODE_TYPE_BOOKMARK)
            suggestion.content = node.uri;
        else
            suggestion.content = "ext+scrapyard://" + node.uuid;

        return suggestion;
    }

    const findSuggestion = text => {
        if (suggestions) {
            if (text.startsWith("ext+scrapyard://")) {
                let uuid = text.replace("ext+scrapyard://", "");
                let match = suggestions.filter(s => s.__node.uuid === uuid);
                if (match.length)
                    return match[0]
            }
            else {
                let match = suggestions.filter(s => s.__node.uri === text);
                if (match.length)
                    return match[0];
            }
        }
    }

    browser.omnibox.onInputChanged.addListener(async (text, suggest) => {
        if (!text.startsWith("+") && text?.length < 3)
            return;
        else if (text.startsWith("+") && text?.length < 4)
            return;

        let provider = text.startsWith("+")
            ? new TagSearchProvider(EVERYTHING)
            : new TitleSearchProvider(EVERYTHING);

        if (text.startsWith("+"))
            text = text.replace(/^\+(?:\s+)?/, "");

        let nodes = await provider.search(text, SEARCH_LIMIT);

        suggestions = nodes.map(makeSuggestion);

        suggest(suggestions);
    });

    browser.omnibox.onInputEntered.addListener(async (text, disposition) => {
        let url = text;

        let suggestion = findSuggestion(text);
        suggestions = null;

        if (suggestion) {
            let activeTab = (await browser.tabs.query({currentWindow: true, active: true}))?.[0];

            let node = suggestion.__node;
            if (node.type === NODE_TYPE_BOOKMARK && node.container) {
                if (activeTab && activeTab.url === "about:newtab")
                    browser.tabs.remove(activeTab.id);
                openContainerTab(url, node.container);
                return;
            }
        }

        switch (disposition) {
            case "currentTab":
                browser.tabs.update({url});
                break;
            case "newForegroundTab":
                browser.tabs.create({url});
                break;
            case "newBackgroundTab":
                browser.tabs.create({url, active: false});
                break;
        }
    });
}


console.log("==> search.js loaded")
