import {packPage} from "./bookmarking.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {NODE_TYPE_ARCHIVE} from "./storage.js";
import {fetchWithTimeout} from "./utils_io.js";
import {send} from "./proxy.js";

class Rules {
    #rules;

    constructor(rules) {
        this.#rules = this.#constructRules(rules);
    }

    match(link) {
        let result = false;
        if (!this.#rules)
            result = true;
        else
            for (const rule of this.#rules) {
                const content = rule.scope === "url"? link.url: link.text;
                let matches = false;

                if (rule.mode === "regex")
                    matches = rule.matcher.test(content);
                else
                    matches = content?.toLowerCase() === rule.matcher.toLowerCase();

                if (matches) {
                    result = true;
                    break;
                }
            }

        return result;
    }

    get empty() {
        return !this.#rules;
    }

    #constructRules(rules) {
        const lines = rules.trim().split("\n");

        if (lines.length) {
            const result = [];

            for (const line of lines) {
                const rule = this.#constructRule(line);
                if (rule)
                    result.push(rule);
            }

            if (result.length)
                return result;
        }
    }

    #constructRule(line) {
        const rule = {scope: "url", mode: "regex"};
        line = line.trim();

        if (line) {
            if (line.startsWith("$text:")) {
                rule.scope = "text";
                line = line.replace(/^\$text:/, "");
            }

            if (!line.startsWith("/"))
                rule.mode = "string";

            if (rule.scope !== "text")
                line = line.split(" ")[0];

            if (rule.mode === "regex") {
                line = line.replace("\\/", "/");
                const matches = line.match(/^\/(.*)\/([a-zA-Z]*)?$/);
                if (matches)
                    rule.matcher = new RegExp(matches[1], matches[2]);
                else {
                    rule.mode = "string";
                    rule.matcher = line;
                }
            }
            else
                rule.matcher = line;

            return rule;
        }
    }
}

class Queue {
    #options;
    #rootURL;
    #rootHost;
    #links = [];
    #visitedURLs;

    constructor(rootURL, options) {
        this.#rootURL = rootURL;
        this.#rootHost = new URL(rootURL).host;
        this.#options = options;

        const normalizedURL = this.#normalizeURL(rootURL);
        this.#visitedURLs = new Set([normalizedURL]);
    }

    #normalizeURL(url) {
        if (this.#options.ignoreHashes)
            url = url.replace(/#.*$/, "");

        return url.toLowerCase();
    }

    push(link) {
        const normalizedURL = this.#normalizeURL(link.url);
        if (!this.#visitedURLs.has(normalizedURL)) {
            this.#visitedURLs.add(normalizedURL);
            this.#links.push(link);
        }
    }

    pop() {
        return this.#links.shift();
    }

    get size() {
        return this.#links.length;
    }
}

class Crawler {
    #queue;
    #options;
    #includeRules;
    #excludeRules;
    #siteBookmark;
    #threads = 0;
    #crawling = false;
    #abort = false;
    onFinish = () => null;

    constructor(bookmark) {
        this.#siteBookmark = bookmark;
        this.#options = {...bookmark.__site_capture};
        this.#includeRules = new Rules(this.#options.includeRules);
        this.#excludeRules = new Rules(this.#options.excludeRules);
        this.#queue = new Queue(bookmark.uri, this.#options);
    }

    enqueue(bookmark) {
        const options = bookmark.__site_capture;

        if (options.level < this.#options.depth && options.links) {
            for (const link of options.links) {
                if (this.#isLinkAllowed(link)) {
                    link.level = options.level + 1;
                    this.#queue.push(link);
                }
            }
        }

        this.#startThreads();
    }

    abort() {
        this.#abort = true;
    }

    #startThreads() {
        if (!this.#crawling) {
            this.#crawling = true;

            this.#threads = Math.min(this.#options.threads, this.#queue.size);
            for (let i = 0; i < this.#threads; ++i)
                this.#visitLink(this.#queue.pop());
        }
    }

    #isLinkAllowed(link) {
        const include = this.#includeRules.match(link);
        const exclude = !this.#excludeRules.empty && this.#excludeRules.match(link);
        return include && !exclude;
    }

    async #visitLink(link) {
        const options = {...this.#options};
        options.level = link.level;

        const bookmark = await this.#savePage(link, options);

        this.#crawl(bookmark);
    }

    #crawl(bookmark) {
        if (this.#abort)
            return;

        if (bookmark)
            this.enqueue(bookmark);

        const nextLink = this.#queue.pop();

        if (nextLink)
            this.#visitLink(nextLink);
        else {
            this.#threads -= 1;
            if (this.#threads === 0)
                this.onFinish();
        }
    }

    async #savePage(link, options) {
        let resource;
        const isHTML = await this.#isHTMLLink(link);
        if (isHTML === true)
            resource = await this.#captureHTMLPage(link, options);
        else if (isHTML === false)
            resource = await this.#captureNonHTMLPage(link, options);

        if (resource)
            await this.#saveArchive(resource);

        return resource?.bookmark
    }

    async #isHTMLLink(link) {
        let response;
        try {
            response = await fetchWithTimeout(link.url, {method: "head"});
        } catch (e) {
            console.error(e);
        }

        if (response?.ok) {
            const contentType = response.headers.get("content-type");
            return !!(contentType && contentType.toLowerCase().startsWith("text/html"));
        }
    }

    #captureHTMLPage(link, options) {
        const bookmark = {uri: link.url, __site_capture: options, __url_packing: true};
        const resolver = (m, t) => ({bookmark: m.bookmark, content: m.data, title: t.title, icon: t.favIconUrl});
        return packPage(link.url, bookmark, null, resolver);
    }

    async #captureNonHTMLPage(link, options) {
        let response;
        try {
            response = await fetchWithTimeout(link.url);
        } catch (e) {
            console.error(e);
        }
        const result = {bookmark: {uri: link.url, __site_capture: options}, title: link.text};

        if (response?.ok) {
            result.contentType = response.headers.get("content-type");
            result.content = await response.blob();
        }

        return result;
    }

    async #saveArchive(result) {
        const bookmark = {
            uri: result.bookmark.uri,
            name: result.title,
            icon: result.icon,
            parent_id: this.#siteBookmark.parent_id
        }

        const node = await Bookmark.add(bookmark, NODE_TYPE_ARCHIVE);
        return Bookmark.storeArchive(node.id, result.content || "", result.contentType || "text/html");
    }
}

let crawler;

export function initialize(bookmark) {
    crawler = new Crawler(bookmark);
    crawler.onFinish = finalize;
}

export function enqueue(bookmark) {
    if (crawler)
        crawler.enqueue(bookmark);
}

export function abort() {
    if (crawler) {
        crawler.abort();
        setTimeout(finalize, 500);
    }
}

async function finalize() {
    crawler = undefined;
    await send.stopProcessingIndication();
    await send.toggleAbortMenu({show: false});
    await send.nodesUpdated();
}
