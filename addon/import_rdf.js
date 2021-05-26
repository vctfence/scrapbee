import {nativeBackend} from "./backend_native.js";
import {getFaviconFromTab} from "./favicon.js";
import {backend} from "./backend.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_GROUP, NODE_TYPE_SEPARATOR, RDF_EXTERNAL_NAME} from "./storage.js";
import {partition} from "./utils.js";
import {send} from "./proxy.js";
import {prepareNewImport} from "./import.js";
import {packPage} from "./bookmarking.js";

function traverseRDFTree(doc, visitor) {
    const namespaces = new Map(Object.values(doc.documentElement.attributes)
        .map(a => [a.localName, a.prefix === "xmlns" ? a.value : null]));
    const ns_resolver = ns => namespaces.get(ns);
    const NS_NC = ns_resolver("NC");
    const NS_RDF = ns_resolver("RDF");
    const NS_SCRAPBOOK = ns_resolver(Array.from(namespaces.keys()).find(k => (/NS\d+/i).test(k)));

    let xselect = path => doc.evaluate(path, doc, ns_resolver, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);

    let node_map = path => {
        const result = new Map();

        let node, nodes = xselect(path);
        while (node = nodes.iterateNext()) {
            if (node.localName === "Description" || node.localName === "BookmarkSeparator") {
                node.__sb_about = node.getAttributeNS(NS_RDF, "about");
                node.__sb_id = node.getAttributeNS(NS_SCRAPBOOK, "id");
                node.__sb_type = node.getAttributeNS(NS_SCRAPBOOK, "type");
                node.__sb_title = node.getAttributeNS(NS_SCRAPBOOK, "title");
                node.__sb_source = node.getAttributeNS(NS_SCRAPBOOK, "source");
                node.__sb_comment = node.getAttributeNS(NS_SCRAPBOOK, "comment");
                node.__sb_icon = node.getAttributeNS(NS_SCRAPBOOK, "icon");
            }
            result.set(node.getAttributeNS(NS_RDF, "about"), node);
        }

        return result;
    };

    let descriptions = node_map("//RDF:Description");
    let seqs = node_map("//RDF:Seq");
    let separators = node_map("//NC:BookmarkSeparator")

    let traverse = (root, visitor) => {
        let doTraverse = async (parent, root) => {
            let seq = seqs.get(root ? root.__sb_about : "urn:scrapbook:root");
            let children = seq.children;
            if (children && children.length) {
                for (let i = 0; i < children.length; ++i) {
                    if (children[i].localName === "li") {
                        let resource = children[i].getAttributeNS(NS_RDF, "resource");
                        let node = descriptions.get(resource) || separators.get(resource);
                        if (node) {
                            await visitor(root, node);
                            if (node.__sb_type === "folder")
                                await doTraverse(root, node);
                        }
                    }
                }
            }
        };

        return doTraverse(null, root);
    };

    return traverse(null, visitor);
}

async function importRDFArchive(node, scrapbook_id, _) {
    let root = nativeBackend.url(`/rdf/import/files/`)
    let base = `${root}data/${scrapbook_id}/`
    let index = `${base}index.html`;

    let initializer = async (bookmark, tab) => {
        let icon = await getFaviconFromTab(tab, true);

        if (icon) {
            bookmark.icon = icon;
            await backend.storeIcon(bookmark);
        }

        node.__mute_ui = true;
    }

    return packPage(index, node, initializer, _ => null, false);
}

export async function importRDF(shelf, path, threads, quick) {
    await prepareNewImport(shelf);

    path = path.replace(/\\/g, "/");

    let rdf_directory = path.substring(0, path.lastIndexOf("/"));
    let rdf_file = path.split("/");
    rdf_file = rdf_file[rdf_file.length - 1];
    let xml = null;

    let helperApp = await nativeBackend.probe(true);

    if (!helperApp)
        return;

    try {
        let form = new FormData();
        form.append("rdf_directory", rdf_directory);
        form.append("rdf_file", rdf_file);

        xml = await nativeBackend.fetchText(`/rdf/import/${rdf_file}`, {method: "POST", body: form});
    } catch (e) {
        console.error(e);
    }

    if (!xml)
        return Promise.reject(new Error("RDF file not found."));

    let rdf = new DOMParser().parseFromString(xml, 'application/xml');
    let id_map = new Map();
    let reverse_id_map = new Map();

    let shelf_node = await backend.getGroupByPath(shelf);
    if (shelf_node) {
        if (quick) {
            shelf_node.external = RDF_EXTERNAL_NAME;
            shelf_node.uri = rdf_directory;
            await backend.updateNode(shelf_node);
        }
        id_map.set(null, shelf_node.id);
    }

    let pos = 0;
    let total = 0;
    let bookmarks = [];

    await traverseRDFTree(rdf, async (parent, node) => {
        const now = new Date();

        let data = {
            pos: pos++,
            uri: node.__sb_source,
            name: node.__sb_title,
            type: node.__sb_type === "folder"
                ? NODE_TYPE_GROUP
                : (node.__sb_type === "separator"
                    ? NODE_TYPE_SEPARATOR
                    : NODE_TYPE_ARCHIVE),
            details: node.__sb_comment,
            parent_id: parent ? id_map.get(parent.__sb_id) : shelf_node.id,
            todo_state: node.__sb_type === "marked" ? 1 : undefined,
            icon: node.__sb_icon,
            date_added: now,
            date_modified: now
        };

        if (quick) {
            data.external = RDF_EXTERNAL_NAME;
            data.external_id = node.__sb_id;
        }

        let bookmark = await backend.importBookmark(data);

        id_map.set(node.__sb_id, bookmark.id);

        if (data.type === NODE_TYPE_GROUP)
            id_map.set(node.__sb_id, bookmark.id);
        else if (data.type === NODE_TYPE_ARCHIVE) {
            reverse_id_map.set(bookmark.id, node.__sb_id);

            bookmarks.push(bookmark);
            total += 1;
        }
    });

    let cancelled = false;

    let cancelListener = function (message, sender, sendResponse) {
        if (message.type === "CANCEL_RDF_IMPORT")
            cancelled = true;
    };

    browser.runtime.onMessage.addListener(cancelListener);


    if (!quick) {
        let parts = bookmarks.length > threads ? partition([...bookmarks], threads) : bookmarks.map(b => [b]);
        let progress = Array.from(new Array(parts.length),() => []);

        let importf = async (items, id) => {
            if (items.length) {
                let bookmark = items.shift();
                let scrapbook_id = reverse_id_map.get(bookmark.id);

                progress[id].push(1);
                let percent = Math.round((progress.reduce((a, p) => a + p.length, 0) / total) * 100);

                try {
                    await importRDFArchive(bookmark, scrapbook_id, rdf_directory);
                } catch (e) {
                    send.rdfImportError({bookmark: bookmark, error: e.message});
                }

                send.rdfImportProgress({progress: percent});

                if (!cancelled)
                    await importf(items, id);
            }
        };

        //let startTime = new Date().getTime() / 1000;

        let id = 0;
        console.log(parts.length, parts)
        await Promise.all(parts.map(part => importf(part, id++)));
        send.rdfImportProgress({progress: 0});

        // let loadTime = Math.round(new Date().getTime() / 1000 - startTime);
        // let m = Math.floor(loadTime / 60);
        // let s = loadTime - m * 60;
        //
        // result.processingTime = m + "m " + s + "s";
    }

    send.nodesImported({shelf: shelf_node});

    send.obtainingIcons({shelf: shelf_node});

    for (let node of bookmarks) {
        if (cancelled)
            break;

        if (node.icon && node.icon.startsWith("resource://scrapbook/")) {
            node.icon = node.icon.replace("resource://scrapbook/", "");
            node.icon = nativeBackend.url(`/rdf/import/files/${node.icon}`);
            await backend.storeIcon(node);
        }
    }

    if (bookmarks.length)
        send.nodesReady({shelf: shelf_node})

    browser.runtime.onMessage.removeListener(cancelListener);
}
