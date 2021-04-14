import {backend} from "./backend.js"
import {TREE_STATE_PREFIX} from "./tree.js";
import {ENDPOINT_TYPES, EVERYTHING, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "./storage_constants.js";


export const SEARCH_MODE_SCRAPYARD = 1;
export const SEARCH_MODE_TITLE = 2;
export const SEARCH_MODE_TAGS = 3;
export const SEARCH_MODE_CONTENT = 4;
export const SEARCH_MODE_FIREFOX = 5;


class SearchProvider {
    constructor(shelf) {
        this.shelf = shelf;
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
    constructor(shelf) {
        super(shelf)
    }

    search(text) {
        let path;
        if (this.shelf !== EVERYTHING)
            path = this.shelf;

        if (text) {
            return backend.listNodes({
                search: text,
                content: true,
                depth: "subtree",
                path: path,
                types: ENDPOINT_TYPES
            });
        }
        return [];
    }
}

export class FirefoxSearchProvider extends SearchProvider {
    constructor(shelf) {
        super(shelf)
    }

    search(text) {
        return browser.bookmarks.search(text).then(bookmarks => {
           return bookmarks.filter(b => b.type === "bookmark").map(b => {
                return {
                    id: "firefox_" + b.id,
                    name: b.title,
                    uri: b.url,
                    type: NODE_TYPE_BOOKMARK
                }
            })
        });
    }
}

export class ScrapyardSearchProvider extends SearchProvider {
    constructor(shelf) {
        super(shelf);

        this.providers = [
            new TitleSearchProvider(shelf),
            new TagSearchProvider(shelf),
            new ContentSearchProvider(shelf)
        ];
    }
    async search(text) {
        let result = [];

        if (text)
            for (let provider of this.providers) {
                let output = await provider.search(text);
                if (output)
                    result = result.concat(output);
            }

        return result.removeDups("id");
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
            case SEARCH_MODE_SCRAPYARD:
                this.provider = new ScrapyardSearchProvider(shelf);
                break;
            case SEARCH_MODE_TITLE:
                this.provider = new TitleSearchProvider(shelf);
                break;
            case SEARCH_MODE_TAGS:
                this.provider = new TagSearchProvider(shelf);
                break;
            case SEARCH_MODE_CONTENT:
                this.provider = new ContentSearchProvider(shelf);
                break;
        }
    }

    search(text) {
        return this.provider.search(text);
    }
}

// omnibox ////////////////////////////////////////////////////////////////////

export function initializeOmnibox() {
    browser.omnibox.setDefaultSuggestion({
        description: `Search Scrapyard bookmarks by title or URL`
    });

    const SEARCH_LIMIT = 6;
    const searchProvider = new TitleSearchProvider(EVERYTHING);

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
        if (text?.length < 3)
            return;

        let nodes = await searchProvider.search(text, SEARCH_LIMIT);

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
                browser.tabs.create({url, cookieStoreId: node.container});
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
