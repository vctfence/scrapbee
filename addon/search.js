import {backend} from "./backend.js"
import {EVERYTHING, NODE_TYPE_BOOKMARK, ENDPOINT_TYPES} from "./storage_idb.js";
import {TREE_STATE_PREFIX} from "./tree.js";


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

    search(text) {
        let path;
        if (this.shelf !== EVERYTHING)
            path = this.shelf;

        if (text)
            return backend.listNodes({
                search: text,
                depth: "subtree",
                path: path,
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
