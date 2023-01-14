import {TREE_STATE_PREFIX} from "./ui/tree.js";
import {CONTENT_NODE_TYPES, EVERYTHING_SHELF_NAME, NODE_TYPE_FOLDER, NODE_TYPE_BOOKMARK} from "./storage.js";
import {getActiveTab, openContainerTab, makeReferenceURL} from "./utils_browser.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {escapeHtml} from "./utils_html.js";
import {settings} from "./settings.js";
import {Node} from "./storage_entities.js";

export const SEARCH_MODE_UNIVERSAL = 0;
export const SEARCH_MODE_TITLE = 1;
export const SEARCH_MODE_TAGS = 2;
export const SEARCH_MODE_CONTENT = 3;
export const SEARCH_MODE_NOTES = 4;
export const SEARCH_MODE_COMMENTS = 5;
export const SEARCH_MODE_DATE = 6;
export const SEARCH_MODE_FOLDER = 7;

const UUID_SEARCH_PREFIX = "uuid:";

class SearchProvider {
    constructor(shelf) {
        this.shelf = shelf;
    }

    isInputValid(text) {
        return text && text.length > 2;
    }
}

export class UniversalSearchProvider extends SearchProvider {
    constructor(shelf) {
        super(shelf);

        this.titleProvider = new TitleSearchProvider(shelf);
        this.folderProvider = new FolderSearchProvider(shelf);
        this.tagProvider = new TagSearchProvider(shelf);
        this.contentProvider = new ContentSearchProvider(shelf, "content");
        this.notesProvider = new ContentSearchProvider(shelf, "notes");
        this.commentsProvider = new ContentSearchProvider(shelf, "comments");
        this.dateProvider = new DateSearchProvider(shelf);

        this.providers = [
            this.titleProvider,
            this.folderProvider,
            this.tagProvider,
            this.contentProvider,
            this.notesProvider,
            this.commentsProvider,
            this.dateProvider
        ];
    }

    search(text) {
        if (text?.startsWith(UUID_SEARCH_PREFIX))
            return this._searchByUUID(text);
        else {
            const availableProviders = this.providers.filter(p => p.isInputValid(text));
            const results = availableProviders.map(p => p.search(text));

            return Promise.all(results).then(results => {
                results = results.reduce((acc, arr) => [...acc, ...arr], []);
                results = results.filter((n, i, a) => this._indexByUUID(a, n.uuid) === i); // distinct
                return results;
            });
        }
    }

    _indexByUUID(nodes, uuid) {
        for (let i = 0; i < nodes.length; ++i) {
            if (nodes[i].uuid === uuid)
                return i;
        }
    }

    async _searchByUUID(text) {
        let result = [];
        text = text.replace(UUID_SEARCH_PREFIX, "").trim();

        const node = await Node.getByUUID(text);

        if (node)
            result = [node];

        return result;
    }
}

export class TitleSearchProvider extends SearchProvider {
    constructor(shelf) {
        super(shelf)
    }

    search(text, limit) {
        if (text) {
            return Bookmark.list({
                search: text,
                depth: "subtree",
                path: this.shelf,
                limit: limit,
                types: CONTENT_NODE_TYPES
            });
        }

        return [];
    }
}

export class FolderSearchProvider extends SearchProvider {
    constructor(shelf) {
        super(shelf)
    }

    search(text, limit) {
        if (text)
            return Bookmark.list({
                search: text,
                depth: "subtree",
                path: this.shelf,
                limit: limit,
                types: [NODE_TYPE_FOLDER]
            });

        return [];
    }
}

export class TagSearchProvider extends SearchProvider {
    constructor(shelf) {
        super(shelf)
    }

    search(text) {
        if (text) {
            return Bookmark.list({
                depth: "subtree",
                path: this.shelf,
                tags: text,
                types: CONTENT_NODE_TYPES
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
        if (text) {
            return Bookmark.list({
                search: text,
                content: true,
                index: this.index,
                partial: settings.sidebar_filter_partial_match(),
                depth: "subtree",
                path: this.shelf
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
        if (text) {
            const dates = [];
            for (const m of text.matchAll(/(\d{4}-\d{2}-\d{2})/g))
                dates.push(m[1]);

            if (dates.length === 1)
                dates.push(undefined);

            const period = /(.*?)\d{4}-\d{2}-\d{2}/.exec(text.trim().toLowerCase())[1];

            return Bookmark.list({
                depth: "subtree",
                path: this.shelf,
                date: dates[0],
                date2: dates[1],
                period: period.trim(),
                types: CONTENT_NODE_TYPES
            });
        }
        return [];
    }

    isInputValid(text) {
        const daterx = /^\s*(?:\d{4}-\d{2}-\d{2})|(?:before\s+\d{4}-\d{2}-\d{2})|(?:after\s+\d{4}-\d{2}-\d{2})|(?:between\s+\d{4}-\d{2}-\d{2}\s+and\s+\d{4}-\d{2}-\d{2})\s*$/i;

        if (super.isInputValid(text)) {
            text = text.trim()
            if (daterx.test(text)) {
                for (const m of text.matchAll(/(\d{4}-\d{2}-\d{2})/g)) {
                    if (isNaN(new Date(m[1])))
                        return false
                }

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
        this.searchMode = SEARCH_MODE_UNIVERSAL;
        this.provider = new UniversalSearchProvider(EVERYTHING_SHELF_NAME);
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
            case SEARCH_MODE_UNIVERSAL:
                this.provider = new UniversalSearchProvider(shelf);
                break;
            case SEARCH_MODE_TITLE:
                this.provider = new TitleSearchProvider(shelf);
                break;
            case SEARCH_MODE_FOLDER:
                this.provider = new FolderSearchProvider(shelf);
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
        let suggText = node.name;
        if (suggText && settings.platform.chrome)
            suggText = escapeHtml(suggText);

        const suggestion = {description: suggText || ""};
        if (node.type === NODE_TYPE_BOOKMARK)
            suggestion.content = node.uri;
        else
            suggestion.content = makeReferenceURL(node.uuid);

        if (settings.platform.firefox)
            suggestion.__node = node;

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
            ? new TagSearchProvider(EVERYTHING_SHELF_NAME)
            : new TitleSearchProvider(EVERYTHING_SHELF_NAME);

        if (text.startsWith("+"))
            text = text.replace(/^\+(?:\s+)?/, "");

        let nodes = await provider.search(text, SEARCH_LIMIT);

        suggestions = nodes.map(makeSuggestion);

        suggest(suggestions);
    });

    browser.omnibox.onInputEntered.addListener(async (text, disposition) => {
        let url = text;

        if (settings.platform.firefox) {
            let suggestion = findSuggestion(text);
            suggestions = null;

            if (suggestion) {
                let activeTab = await getActiveTab();

                let node = suggestion.__node;
                if (node.type === NODE_TYPE_BOOKMARK && node.container) {
                    await openContainerTab(url, node.container);

                    if (activeTab && activeTab.url === "about:newtab")
                        browser.tabs.remove(activeTab.id);
                    return;
                }
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

