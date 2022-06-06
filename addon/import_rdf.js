import {nativeBackend} from "./backend_native.js";
import {getFaviconFromTab} from "./favicon.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_GROUP, NODE_TYPE_SEPARATOR, RDF_EXTERNAL_NAME} from "./storage.js";
import {ProgressCounter} from "./utils.js";
import {send} from "./proxy.js";
import {packPage} from "./bookmarking.js";
import {Group} from "./bookmarks_group.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Node} from "./storage_entities.js";
import {StreamImporterBuilder} from "./import_drivers.js";
import {RDFNamespaces} from "./utils_html.js";

class RDFImporter {
    #options;
    #nodeID_SB2SY = new Map();
    #nodeID_SY2SB = new Map();
    #shelf;
    #bookmarks = [];
    #cancelled = false;
    #progressCounter;
    #threads;

    constructor(importOptions) {
        this.#options = importOptions;
    }

    async import() {
        const helperApp = await nativeBackend.probe(true);
        if (!helperApp)
            return;

        const path = this.#options.stream.replace(/\\/g, "/");
        const xml = await this.#getRDFXML(path);

        if (!xml)
            return Promise.reject(new Error("RDF file not found."));

        await this.#buildBookmarkTree(path, xml);
        await this.#importArchives();
    }

    #traverseRDFTree(doc, visitor, data) {
        const namespaces = new RDFNamespaces(doc);
        const seqs = this.#mapURNToNodes("//RDF:Seq", doc, namespaces, false);
        const separators = this.#mapURNToNodes("//NC:BookmarkSeparator", doc, namespaces)
        const descriptions = this.#mapURNToNodes("//RDF:Description", doc, namespaces);
        const leaves = new Map([...separators, ...descriptions]);

        async function doTraverse(parent, current, visitor) {
            let seq = seqs.get(current? current.__sb_about: "urn:scrapbook:root");
            let children = seq.children;

            if (children && children.length) {
                for (let i = 0; i < children.length; ++i) {
                    if (children[i].localName === "li") {
                        let resource = children[i].getAttributeNS(namespaces.NS_RDF, "resource");
                        let node = leaves.get(resource);

                        if (node) {
                            await visitor(current, node, data);
                            if (node.__sb_type === "folder")
                                await doTraverse(current, node, visitor);
                        }
                    }
                }
            }
        }

        return doTraverse(null, null, visitor);
    }

    #mapURNToNodes(xpath, doc, namespaces, collectAttributes = true) {
        const result = new Map();
        const nodes = doc.evaluate(xpath, doc, namespaces.resolver, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);
        let node;

        while (node = nodes.iterateNext()) {
            if (collectAttributes) {
                node.__sb_about = node.getAttributeNS(namespaces.NS_RDF, "about");
                node.__sb_id = node.getAttributeNS(namespaces.NS_SCRAPBOOK, "id");
                node.__sb_type = node.getAttributeNS(namespaces.NS_SCRAPBOOK, "type");
                node.__sb_title = node.getAttributeNS(namespaces.NS_SCRAPBOOK, "title");
                node.__sb_source = node.getAttributeNS(namespaces.NS_SCRAPBOOK, "source");
                node.__sb_comment = node.getAttributeNS(namespaces.NS_SCRAPBOOK, "comment");
                node.__sb_icon = node.getAttributeNS(namespaces.NS_SCRAPBOOK, "icon");
            }

            result.set(node.getAttributeNS(namespaces.NS_RDF, "about"), node);
        }

        return result;
    }

    async #getRDFXML(path) {
        const rdfFile = path.split("/").at(-1);
        const rdfDirectory = path.substring(0, path.lastIndexOf("/"));
        let xml = null;

        try {
            let form = new FormData();
            form.append("rdf_file", rdfFile);
            form.append("rdf_directory", rdfDirectory);

            xml = await nativeBackend.fetchText(`/rdf/import/${rdfFile}`, {method: "POST", body: form});
        } catch (e) {
            console.error(e);
        }

        return xml;
    }

    async #buildBookmarkTree(path, xml) {
        this.#shelf = await this.#createShelf(path);
        const rdfDoc = new DOMParser().parseFromString(xml, 'application/xml');

        await this.#traverseRDFTree(rdfDoc, this.#createBookmark.bind(this), {pos: 0});
    }

    async #importArchives() {
        let cancelListener = (message, sender, sendResponse) => {
            if (message.type === "cancelRdfImport")
                this.#cancelled = true;
        };
        browser.runtime.onMessage.addListener(cancelListener);

        try {
            if (!this.#options.quick) {
                this.#progressCounter = new ProgressCounter(this.#bookmarks.length, "rdfImportProgress", {muteSidebar: true});
                await this.#startThreads(this.#importThread.bind(this));
            }
            else
                await this.#onFinish();
        } finally {
            browser.runtime.onMessage.removeListener(cancelListener);
        }
    }

    async #startThreads(threadf) {
        const bookmarks = [...this.#bookmarks];
        this.#threads = Math.min(this.#options.threads, this.#bookmarks.length);

        const promises = [];
        for (let i = 0; i < this.#threads; ++i)
            promises.push(threadf(bookmarks));

        return Promise.all(promises);
    }

    async #importThread(bookmarks) {
        if (bookmarks.length && !this.#cancelled) {
            let bookmark = bookmarks.shift();

            try {
                let scrapbookId = this.#nodeID_SY2SB.get(bookmark.id);
                await this.#importRDFArchive(bookmark, scrapbookId);
            } catch (e) {
                send.rdfImportError({bookmark: bookmark, error: e.message});
            }

            this.#progressCounter.incrementAndNotify();

            return this.#importThread(bookmarks);
        }
        else {
            this.#threads -= 1;
            if (this.#threads === 0)
                return this.#onFinish();
        }
    }

    async #iconImportThread(bookmarks) {
        if (bookmarks.length && !this.#cancelled) {
            let bookmark = bookmarks.shift();

            if (bookmark.icon && bookmark.icon.startsWith("resource://scrapbook/")) {
                bookmark.icon = bookmark.icon.replace("resource://scrapbook/", "");
                bookmark.icon = nativeBackend.url(`/rdf/import/files/${bookmark.icon}`);
                await Bookmark.storeIcon(bookmark);
            }

            return this.#iconImportThread(bookmarks);
        }
        else {
            this.#threads -= 1;
            if (this.#threads === 0)
                send.nodesReady({shelf: this.#shelf});
        }
    }

    async #importRDFArchive(node, scrapbookId) {
        let root = nativeBackend.url(`/rdf/import/files/`)
        let base = `${root}data/${scrapbookId}/`
        let index = `${base}index.html`;

        let initializer = async (bookmark, tab) => {
            let icon = await getFaviconFromTab(tab, true);

            if (icon) {
                bookmark.icon = icon;
                await Bookmark.storeIcon(bookmark);
            }

            node.__mute_ui = true;
        }

        return packPage(index, node, initializer, _ => null, false);
    }

    async #onFinish() {
        send.nodesImported({shelf: this.#shelf});

        if (!this.#options.quick)
            this.#progressCounter.finish();

        send.obtainingIcons({shelf: this.#shelf});
        await this.#startThreads(this.#iconImportThread.bind(this));
    }

    async #createShelf(path) {
        const shelfNode = await Group.getOrCreateByPath(this.#options.name);

        if (shelfNode) {
            if (this.#options.quick) {
                shelfNode.external = RDF_EXTERNAL_NAME;
                shelfNode.uri = path.substring(0, path.lastIndexOf("/"));
                await Node.update(shelfNode);
            }
            this.#nodeID_SB2SY.set(null, shelfNode.id);
        }

        return shelfNode;
    }

    async #createBookmark(parent, node, vars) {
        const now = new Date();

        let data = {
            pos: vars.pos++,
            uri: node.__sb_source,
            name: node.__sb_title,
            type: node.__sb_type === "folder"
                ? NODE_TYPE_GROUP
                : (node.__sb_type === "separator"
                    ? NODE_TYPE_SEPARATOR
                    : NODE_TYPE_ARCHIVE),
            details: node.__sb_comment,
            parent_id: parent ? this.#nodeID_SB2SY.get(parent.__sb_id) : this.#shelf.id,
            todo_state: node.__sb_type === "marked" ? 1 : undefined,
            icon: node.__sb_icon,
            date_added: now,
            date_modified: now
        };

        if (this.#options.quick) {
            data.external = RDF_EXTERNAL_NAME;
            data.external_id = node.__sb_id;
        }

        let bookmark = await Bookmark.import(data);

        this.#nodeID_SB2SY.set(node.__sb_id, bookmark.id);

        if (data.type === NODE_TYPE_GROUP)
            this.#nodeID_SB2SY.set(node.__sb_id, bookmark.id);
        else if (data.type === NODE_TYPE_ARCHIVE) {
            this.#nodeID_SY2SB.set(bookmark.id, node.__sb_id);
            this.#bookmarks.push(bookmark);
        }
    }

}

export class RDFImporterBuilder extends StreamImporterBuilder {
    setNumberOfThreads(threads) {
        this._importOptions.threads = threads;
    }

    setQuickImport(quick) {
        this._importOptions.quick = quick;
    }

    _createImporter(options) {
        return new RDFImporter(options);
    }
}
