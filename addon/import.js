import * as org from "./org.js"
import {partition, loadLocalResource, ReadLine, getFavicon, getThemeVar} from "./utils.js"
import {backend} from "./backend.js"
import {settings} from "./settings.js"

//import LZString from "./lib/lz-string.js"
import {
    NODE_TYPE_SHELF,
    NODE_TYPE_GROUP,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    DEFAULT_POSITION,
    TODO_STATES,
    TODO_NAMES,
    EVERYTHING, DEFAULT_SHELF_NAME, DEFAULT_SHELF_ID, FIREFOX_SHELF_NAME, FIREFOX_SHELF_ID, NODE_PROPERTIES,
    isContainer, NODE_TYPE_SEPARATOR, RDF_EXTERNAL_NAME
} from "./db.js";

const EXPORT_VERSION = 1;

async function prepareNewImport(shelf) {
    if (shelf === EVERYTHING) {
        return backend.wipeEveritying();
    }
    else {
        shelf = await backend.queryShelf(shelf);

        if (shelf && shelf.name === DEFAULT_SHELF_NAME) {
            return backend.deleteChildNodes(shelf.id);
        } else if (shelf) {
            return backend.deleteNodes(shelf.id);
        }
    }
}

// ORG /////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function traverseOrgNode(node, callback) {
    callback(node);
    if (node.children && node.children.length)
        for (let c of node.children)
            traverseOrgNode(c, callback);
}

export async function importOrg(shelf, text) {
    await prepareNewImport(shelf);

    let compressed = false; //org_lines.directiveValues["compressed:"] && org_lines.directiveValues["compressed:"] === "t";

    let path = shelf === EVERYTHING? []: [shelf];
    let level = 0;

    let last_object;

    let importLastObject = async function () {
        if (last_object) {
            // UUIDs currently aren't accounted

            let node;

            let notes = last_object.notes;
            delete last_object.notes;

            let notes_format = last_object.notes_format;
            delete last_object.notes_format;

            let note_lines = last_object.note_lines;
            delete last_object.note_lines;

            if (last_object.type === NODE_TYPE_ARCHIVE) {
                let data = last_object.data;
                let binary = !!last_object.byte_length;

                delete last_object.data;
                delete last_object.byte_length;

                node = await backend.importBookmark(last_object);

                if (data) {
                    await backend.storeBlob(node.id, data, last_object.mime_type);

                    if (!binary)
                        await backend.storeIndex(node.id, data.indexWords());
                }
            }
            else {
                node = await backend.importBookmark(last_object);
            }

            if (notes) {
                await backend.storeNotes(node.id, notes, notes_format);
            }
            else if (note_lines.length) {
                await backend.storeNotes(node.id, note_lines.join("\n"));
            }

            last_object = null;
        }
    };

    let org_lines = new org.Parser().parse(text);

    for (let line of org_lines.nodes) {
        let subnodes = [];
        traverseOrgNode(line, n => subnodes.push(n));
        subnodes = subnodes.filter(n => !(n.type === "inlineContainer"
            || n.type === "text" && !n.value));

        //console.log(subnodes)

        if (subnodes.length && subnodes[0].type === "header" && subnodes.some(n => n.type === "link")) {
            await importLastObject();

            if (level >= subnodes[0].level) {
                while (level >= subnodes[0].level) {
                    path.pop();
                    level -= 1;
                }
            }

            let link = subnodes.find(n => n.type === "link");
            let index = subnodes.indexOf(link);

            last_object = {
                uri: link.src,
                name: subnodes[index + 1].value,
                type: NODE_TYPE_BOOKMARK,
                pos: DEFAULT_POSITION,
                path: path.join("/"),
                note_lines: []
            };

            if (subnodes[1].type === "text") {
                let todo = subnodes[1].value.trim().toUpperCase();
                if (TODO_STATES[todo])
                    last_object.todo_state = TODO_STATES[todo];
            }

            if (subnodes.length > 3 && subnodes[subnodes.length - 1].type === "text"
                    && /^:.*:$/.test(subnodes[subnodes.length - 1].value.trim())) {

                last_object.tags = subnodes[subnodes.length - 1].value.trim()
                    .split(":")
                    .map(t => t.trim())
                    .filter(t => !!t)
                    .join(",");
            }
        }
        else if (subnodes.length > 1 && subnodes[0].type === "header" && subnodes[1].type === "text") {
            await importLastObject();

            let name = subnodes[1].value;

            if (shelf === EVERYTHING && level === 0 && name && name.toLocaleLowerCase() === FIREFOX_SHELF_NAME) {
                name = settings.capitalize_builtin_shelf_names()
                    ? name.capitalizeFirstLetter()
                    : name;

                name += " (imported)";
            }

            if (level < subnodes[0].level) {
                level += 1;
                path.push(name);
            }
            else {
                while (level >= subnodes[0].level) {
                    path.pop();
                    level -= 1;
                }
                level += 1;
                path.push(name);
            }
        }
        else if (subnodes.length && subnodes[0].type === "drawer" && subnodes[0].name === "PROPERTIES") {
            subnodes.shift();

            if (last_object) {
                for (let property of subnodes) {
                    switch (property.name) {
                        case "pos":
                            break;
                        case "type":
                        case "todo_state":
                        case "byte_length":
                            if (property.value)
                                last_object[property.name] = parseInt(property.value);
                            break;
                        case "date_added":
                        case "date_modified":
                            if (property.value)
                                last_object[property.name] = new Date(property.value);
                            break;
                        default:
                            if (property.value)
                                last_object[property.name] = property.value.trim();
                    }
                }

                if (last_object.type === NODE_TYPE_ARCHIVE) {
                    if (last_object.data) {
                        last_object.data = compressed
                            ? null //LZString.decompressFromBase64(last_object.data)
                            : JSON.parse(last_object.data);

                        if (last_object.byte_length) {
                            let byteArray = new Uint8Array(last_object.byte_length);
                            for (let i = 0; i < last_object.data.length; ++i)
                                byteArray[i] = last_object.data.charCodeAt(i);

                            last_object.data = byteArray;
                        }
                    }
                }

                if (last_object.notes) {
                    last_object.notes = compressed
                        ? null // LZString.decompressFromBase64(last_object.notes)
                        : JSON.parse(last_object.notes);
                }
            }
        }
        else if (subnodes.length > 1 && subnodes[0].type === "paragraph" && subnodes[1].type === "text"
                && /\s*DEADLINE:.*/.test(subnodes[1].value)) {

            let match = /\s*DEADLINE:\s*<([^>]+)>/.exec(subnodes[1].value);

            if (match && match[1] && last_object)
                last_object["todo_date"] = match[1];
        }
        else if (subnodes.length > 1 && subnodes[0].type === "paragraph" && subnodes[1].type === "text") {
            if (last_object)
                last_object.note_lines.push(subnodes[1].value);
        }
    }

    await importLastObject();
}

const ORG_EXPORTED_KEYS = ["uuid", "icon", "type", "details", "date_added", "date_modified", "external", "external_id"];

async function objectToProperties(object, compress) {
    let lines = [];
    let node = await backend.getNode(object.id);

    if (node.external === FIREFOX_SHELF_NAME) {
        delete node.external;
        delete node.external_id;
    }

    for (let key of ORG_EXPORTED_KEYS) {
        if (node[key])
            lines.push(`:${key}: ${node[key]}`);
    }

    if (node.type === NODE_TYPE_ARCHIVE) {
        let blob = await backend.fetchBlob(node.id);
        if (blob) {
            if (blob.type)
                lines.push(`:mime_type: ${blob.type}`);

            if (blob.byte_length)
                lines.push(`:byte_length: ${blob.byte_length}`);

            let content = compress
                ? null //LZString.compressToBase64(blob.data)
                : JSON.stringify(blob.data);

            lines.push(`:data: ${content}`);
        }
    }

    let notes = await backend.fetchNotes(node.id);
    if (notes && notes.content) {
        let content = compress
            ? null //LZString.compressToBase64(notes.content)
            : JSON.stringify(notes.content);

        lines.push(`:notes: ${content}`);

        if (notes.format)
            lines.push(`:notes_format: ${notes.format}`);
    }

    return lines.map(l => " ".repeat(object.level + 3) + l).join(`\n`);
}

export async function exportOrg(file, nodes, shelf, uuid, shallow = false, compress = false) {
    let org_lines = [];

    if (!shallow)
        file.append(
`#-*- coding: utf-8 -*-
#+EXPORT: Scrapyard
#+VERSION: ${EXPORT_VERSION}
#+NAME: ${shelf}
#+UUID: ${uuid}
#+DATE: ${new Date().toISOString()}
`);

    if (compress)
        file.append("#+COMPRESSED: t\n");

    file.append("#+TODO: TODO WAITING POSTPONED | DONE CANCELLED\n");

    for (let node of nodes) {
        if (node.type === NODE_TYPE_SHELF || node.type === NODE_TYPE_GROUP) {
            let line = "\n" + "*".repeat(node.level) + " " + node.name;
            file.append(line);
        }
        else {
            let line = "\n" + "*".repeat(node.level);

            if (node.todo_state)
                line += " " + TODO_NAMES[node.todo_state];

            line += " [[" + (node.uri? node.uri: "") + "][" + node.name + "]]";

            if (node.tags) {
                let tag_list = node.tags.split(",").map(t => t.trim());
                line += "    :" + tag_list.join(":") + ":";
            }

            if (node.todo_date)
                line += "\n    DEADLINE: <" + node.todo_date + ">";

            file.append(line);
        }

        if (!shallow) {
            let props = `
${" ".repeat(node.level + 1)}:PROPERTIES:
${await objectToProperties(node, compress)}
${" ".repeat(node.level + 1)}:END:`;
            file.append(props);
        }
    }
}


// HTML ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function importHtml(shelf, text) {
    await prepareNewImport(shelf);

    let html = jQuery.parseHTML(text);
    let root = html.find(e => e.localName === "dl");
    let path = [shelf];

    function peekType(node) {
        for (let child of node.childNodes) {
            if (child.localName === "a")
                return ["link", child];
            else if (child.localName === "h3")
                return ["folder", child];
        }
        return ["unknown", null];
    }

    async function traverseHtml(root, path) {
        for (let child of root.childNodes) {
            if (child.localName === "dt") {
                let [type, node] = peekType(child);
                if (type === "folder") {
                    path.push(node.textContent);
                    await traverseHtml(child, path);
                    path.pop();
                }
                else if (type === "link") {
                    node = await backend.importBookmark( {
                        uri: node.href,
                        name: node.textContent,
                        type: NODE_TYPE_BOOKMARK,
                        pos: DEFAULT_POSITION,
                        path: path.join("/")
                    });
                }
            }
            else if (child.localName === "dl") {
                await traverseHtml(child, path);
            }
        }
    }

    await traverseHtml(root, path);
}


// JSON ////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function parseJSONObject(line) {
    let object;
    line = line.trim();
    try {
        if (line.endsWith(","))
            object = JSON.parse(line.slice(0, line.length - 1));
        else
            object = JSON.parse(line);
    }
    catch (e) {
        console.log(e)
    }

    return object;
}

async function importJSONObject(object) {
    let node;

    delete object.id;
    delete object.uuid;

    let notes = object.notes;
    delete object.notes;

    let notes_format = object.notes_format;
    delete object.notes_format;

    if (object.type === NODE_TYPE_ARCHIVE) {
        let data = object.data;
        let binary = !!object.byte_length;

        delete object.data;
        delete object.byte_length;

        node = await backend.importBookmark(object);

        if (data) {
            await backend.storeBlob(node.id, data, object.mime_type);

            if (!binary)
                await backend.storeIndex(node.id, data.indexWords());
        }
    }
    else {
        node = await backend.importBookmark(object);
    }

    if (notes) {
        await backend.storeNotes(node.id, notes, notes_format);
    }

    return node;
}

function renameFirefoxShelf(node) {
    if (node && node.id === FIREFOX_SHELF_ID) {
        node.name = settings.capitalize_builtin_shelf_names()
            ? node.name.capitalizeFirstLetter()
            : node.name;

        node.name += " (imported)";
    }
}

export async function importJSON(shelf, file) {
    await prepareNewImport(shelf);

    let readline = new ReadLine(file);
    let lines = readline.lines();
    let meta_line = (await lines.next()).value;

    if (!meta_line || !meta_line.startsWith("[{"))
        return Promise.reject(new Error("invalid JSON formatting"));

    let id_map = new Map();
    let first_object = (await lines.next()).value;

    if (!first_object)
        return Promise.reject(new Error("invalid JSON formatting"));

    first_object = parseJSONObject(first_object);

    if (!first_object)
        return Promise.reject(new Error("invalid JSON formatting"));

    let aliased_everything = !first_object.parent_id && shelf !== EVERYTHING;

    if (aliased_everything) {
        first_object.parent_id = null;
        first_object.type = NODE_TYPE_GROUP;
    }
    else
        id_map.set(DEFAULT_SHELF_ID, DEFAULT_SHELF_ID);

    let shelf_node = shelf !== EVERYTHING? await backend.getGroupByPath(shelf): null;
    if (shelf_node) {
        id_map.set(first_object.parent_id, shelf_node.id); // root id
        first_object.parent_id = shelf_node.id;
    }

    let first_object_id = first_object.id;

    renameFirefoxShelf(first_object);

    if (first_object.name.toLocaleLowerCase() !== DEFAULT_SHELF_NAME || aliased_everything) {
        first_object = await importJSONObject(first_object);
        if (first_object_id && isContainer(first_object))
            id_map.set(first_object_id, first_object.id);
    }

    for await (let line of lines) {
        if (line === "]")
            break;

        let object = parseJSONObject(line);
        if (object) {
            renameFirefoxShelf(object);

            if (object.type === NODE_TYPE_SHELF && object.name.toLocaleLowerCase() === DEFAULT_SHELF_NAME
                && !aliased_everything)
                    continue;

            let old_object_id = object.id;

            if (object.parent_id)
                object.parent_id = id_map.get(object.parent_id);
            else if (object.type === NODE_TYPE_SHELF && aliased_everything) {
                object.type = NODE_TYPE_GROUP;
                object.parent_id = shelf_node.id;
            }

            object = await importJSONObject(object);

            if (old_object_id && isContainer(object))
                id_map.set(old_object_id, object.id);
        }
    }
}


async function objectToJSON(object, shallow, compress) {
    let node = await backend.getNode(object.id);

    if (node.external === FIREFOX_SHELF_NAME) {
        delete node.external;
        delete node.external_id;
    }

    for (let key of Object.keys(node)) {
        if (!NODE_PROPERTIES.some(k => k === key))
            delete node[key];
    }

    if (!shallow) {
        if (node.type === NODE_TYPE_ARCHIVE) {
            let blob = await backend.fetchBlob(node.id);
            if (blob) {
                if (blob.type)
                    node.mime_type = blob.type;

                if (blob.byte_length)
                    node.byte_length = blob.byte_length;

                node.data = compress
                    ? null //LZString.compressToBase64(blob.data)
                    : blob.data;
            }
        }

        let notes = await backend.fetchNotes(node.id);
        if (notes && notes.content) {
            node.notes = compress
                ? null //LZString.compressToBase64(notes.content)
                : notes.content;

            node.notes_format = notes.format;
        }
    }

    return JSON.stringify(node);
}

export async function exportJSON(file, nodes, shelf, uuid, shallow = false, compress = false) {
    let meta = {
        export: "Scrapyard",
        version: EXPORT_VERSION,
        name: shelf,
        uuid: uuid,
        date: new Date()
    };

    if (compress)
        meta.compressed = true;

    file.append("[" + JSON.stringify(meta) + ",\n");

    let last = nodes[nodes.length - 1];

    for (let node of nodes) {
        let json = await objectToJSON(node, shallow);
        file.append(json + (node === last? "\n]": ",\n"));
    }
}


// RDF /////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function traverseRDFTree(doc, visitor) {
    const namespaces = new Map(Object.values(doc.documentElement.attributes)
        .map(a => [a.localName, a.prefix === "xmlns"? a.value: null]));
    const ns_resolver = ns => namespaces.get(ns);
    const NS_NC = ns_resolver("NC");
    const NS_RDF = ns_resolver("RDF");
    const NS_SCRAPBOOK = ns_resolver("NS1");

    let xselect = path => doc.evaluate(path, doc, ns_resolver, XPathResult.UNORDERED_NODE_ITERATOR_TYPE, null);

    let node_map = path => {
        const result = new Map();

        let node, nodes = xselect(path);
        while(node = nodes.iterateNext()) {
            if (node.localName === "Description" || node.localName === "BookmarkSeparator") {
                node.__sb_about = node.getAttributeNS(NS_RDF, "about");
                node.__sb_id = node.getAttributeNS(NS_SCRAPBOOK, "id");
                node.__sb_type = node.getAttributeNS(NS_SCRAPBOOK, "type");
                node.__sb_title = node.getAttributeNS(NS_SCRAPBOOK, "title");
                node.__sb_source = node.getAttributeNS(NS_SCRAPBOOK, "source");
                node.__sb_comment = node.getAttributeNS(NS_SCRAPBOOK, "comment");
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
            let seq = seqs.get(root? root.__sb_about: "urn:scrapbook:root");
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

function resolveURL(url, base) {
    let result;

    try {
        result = new URL(url, base);
    }
    catch (e) {
        return null;
    }

    return result.href;
}

export async function instantiateLinkedResources(html, base, urls, depth) {
    if (depth >= settings.frame_depth())
        return;

    let doc = new DOMParser().parseFromString(html, "text/html");
    let iframes = doc.querySelectorAll("iframe");
    let styles = doc.querySelectorAll("link[rel='stylesheet'");

    for (let style of styles) {
        let url = style.getAttribute("href");
        if (url && (url = resolveURL(url, base))) {
            let css = await loadLocalResource(url);
            if (css.data) {
                let blob = new Blob([new TextEncoder().encode(css.data)]);
                url = URL.createObjectURL(blob);
                urls.push(url);
                style.href = url;
            }
        }
    }

    for (let iframe of iframes) {
        let url = iframe.getAttribute("src");
        if (url && (url = resolveURL(url, base))) {
            let html = await loadLocalResource(url, "binary");
            if (html.data) {
                html = html.type === "text/html"
                    ? await instantiateLinkedResources(new TextDecoder().decode(html.data), base, urls, depth + 1)
                    : html.data;
                let blob = new Blob([html]);
                url = URL.createObjectURL(blob);
                urls.push(url);
                iframe.src = url;
            }
        }
    }

    return doc.documentElement.outerHTML;
}

export const SCRAPYARD_LOCK_SCREEN =
    `<div id="scrapyard-waiting" 
          style="background-color: ${getThemeVar("--theme-background")}; 
          z-index: 2147483647; 
          position: fixed;
          inset: 0px; 
          background-image: url(${browser.runtime.getURL(getThemeVar("--themed-tape-icon"))}); 
          background-size: 50mm 50mm;
          background-repeat: no-repeat; 
          background-position: center center;"></div>`;

async function importRDFArchive(node, scrapbook_id, root_path) {
    let base = `file://${root_path}/data/${scrapbook_id}/`;
    let index = `${base}index.html`;
    let html = await loadLocalResource(index);

    if (!html.data)
        return;

    html = html.data.replace(/<body([^>]*)>/, `<body\$1>${SCRAPYARD_LOCK_SCREEN}`);

    let urls = [];

    html = await instantiateLinkedResources(html, base, urls, 0);

    let blob = new Blob([new TextEncoder().encode(html)], {type: "text/html"});
    let url = URL.createObjectURL(blob);

    urls.push(url);

    //browser.tabs.hide(tab.id);

    return new Promise(async (resolve, reject) => {
        let completionListener = function(message, sender, sendResponse) {
            if (message.type === "STORE_PAGE_HTML" && message.payload.tab_id === import_tab.id) {
                browser.tabs.onUpdated.removeListener(listener);
                browser.runtime.onMessage.removeListener(completionListener);
                browser.tabs.remove(import_tab.id);

                for (let url of urls) {
                    URL.revokeObjectURL(url);
                }

                resolve();
            }
        };

        browser.runtime.onMessage.addListener(completionListener);

        let listener = async (id, changed, tab) => {
            if (id === import_tab.id && changed.status === "complete") {

                let initializationListener = async function(message, sender, sendResponse) {
                    if (message.type === "CAPTURE_SCRIPT_INITIALIZED" && sender.tab.id === import_tab.id) {
                        browser.runtime.onMessage.removeListener(initializationListener);

                        node.__local_import = true;
                        node.__local_import_base = `file://${root_path}/data/${scrapbook_id}/`;
                        node.tab_id = import_tab.id;

                        try {
                            await browser.tabs.sendMessage(import_tab.id, {
                                type: "performAction",
                                menuaction: 2,
                                payload: node
                            });
                        } catch (e) {
                            reject(e);
                        }
                    }
                };

                browser.runtime.onMessage.addListener(initializationListener);

                try {
                    try {
                        await browser.tabs.executeScript(tab.id, {file: "savepage/content-frame.js", allFrames: true});
                    } catch (e) {}

                    await browser.tabs.executeScript(import_tab.id, {file: "savepage/content.js"});
                }
                catch (e) {
                    reject(e);
                }
            }
        };

        browser.tabs.onUpdated.addListener(listener);

        let import_tab = await browser.tabs.create({url: url, active: false});
    });

}

export async function importRDF(shelf, path, threads, quick) {
    await prepareNewImport(shelf);

    path = path.replace(/\\/g, "/");

    let rdf_directory = path.substring(0, path.lastIndexOf("/"));

    let xml = await loadLocalResource("file://" + path);

    if (!xml.data)
        return Promise.reject(new Error("RDF file not found."));

    let rdf = new DOMParser().parseFromString(xml.data, 'application/xml');
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
            parent_id: parent? id_map.get(parent.__sb_id): shelf_node.id,
            todo_state: node.__sb_type === "marked"? 1: undefined
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

    let progress = 0;
    let parts = bookmarks.length > threads? partition(bookmarks, threads): bookmarks.map(b => [b]);

    let importf = async (items) => {
        if (items.length) {
            let bookmark = items.shift();
            let scrapbook_id = reverse_id_map.get(bookmark.id);
            let percent = Math.round((++progress / total) * 100);

            try {
                await importRDFArchive(bookmark, scrapbook_id, rdf_directory);
            }
            catch (e) {
                browser.runtime.sendMessage({type: "RDF_IMPORT_ERROR", bookmark: bookmark, error: e.message,
                    index: `${bookmark.__local_import_base}index.html`});
            }

            browser.runtime.sendMessage({type: "RDF_IMPORT_PROGRESS", progress: percent});
            await importf(items);
        }
    };

    if (!quick) {
        //let startTime = new Date().getTime() / 1000;
        browser.runtime.sendMessage({type: "RDF_IMPORT_PROGRESS", progress: 0});
        await Promise.all(parts.map(bb => importf(bb)));

        // let loadTime = Math.round(new Date().getTime() / 1000 - startTime);
        // let m = Math.floor(loadTime / 60);
        // let s = loadTime - m * 60;
        //
        // result.processingTime = m + "m " + s + "s";
    }

    browser.runtime.sendMessage({type: "NODES_IMPORTED", shelf: shelf_node});

    for (let node of bookmarks) {
        if (node.uri) {
            node.icon = await getFavicon(node.uri);
            await backend.updateNode(node);
        }
    }

    if (!quick && bookmarks.length)
        setTimeout(() => browser.runtime.sendMessage({type: "NODES_READY", shelf: shelf_node}), 500);
}
