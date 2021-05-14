import {send} from "./proxy.js";
import * as org from "./lib/org/org.js"
import {backend, formatShelfName} from "./backend.js"
import {nativeBackend} from "./backend_native.js"
import UUID from "./lib/uuid.js";

import {
    CLOUD_EXTERNAL_NAME, CLOUD_SHELF_ID, CLOUD_SHELF_NAME,
    DEFAULT_POSITION, DEFAULT_SHELF_ID, DEFAULT_SHELF_NAME, EVERYTHING, FIREFOX_SHELF_ID, FIREFOX_SHELF_NAME,
    NODE_PROPERTIES, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_GROUP, NODE_TYPE_SEPARATOR, NODE_TYPE_SHELF,
    RDF_EXTERNAL_NAME, TODO_NAMES, TODO_STATES,
    isContainer
} from "./storage_constants.js";

import {packPage} from "./background.js"

import {partition} from "./utils.js"
import {getFavicon, getFaviconFromTab} from "./favicon.js";

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

    let path = shelf === EVERYTHING? []: [shelf];
    let level = 0;

    let last_object;

    let importLastObject = async function () {
        if (last_object) {
            let node;

            let notes = last_object.notes;
            delete last_object.notes;

            let notes_html = last_object.notes_html;
            delete last_object.notes_html;

            let notes_format = last_object.notes_format;
            delete last_object.notes_format;

            let notes_align = last_object.notes_align;
            delete last_object.notes_align;

            let notes_width = last_object.notes_width;
            delete last_object.notes_width;

            let note_lines = last_object.note_lines;
            delete last_object.note_lines;

            let comments = last_object.comments;
            delete last_object.comments;

            let icon_data = last_object.icon_data;
            delete last_object.icon_data;

            if (last_object.type === NODE_TYPE_ARCHIVE) {
                let data = last_object.data;
                let byte_length = last_object.byte_length;

                delete last_object.data;
                delete last_object.byte_length;

                node = await backend.importBookmark(last_object);

                if (data)
                    await backend.storeBlobLowLevel(node.id, data, last_object.mime_type, byte_length);
            }
            else {
                node = await backend.importBookmark(last_object);
            }

            if (notes) {
                await backend.storeNotesLowLevel({node_id: node.id, content: notes, html: notes_html,
                    format: notes_format, align: notes_align, width: notes_width});
            }
            else if (note_lines.length) {
                await backend.storeNotesLowLevel({node_id: node.id, content: note_lines.join("\n"), format: "org"});
            }

            if (comments) {
                await backend.storeCommentsLowLevel(node.id, JSON.parse(comments));
            }

            if (icon_data) {
                await backend.storeIconLowLevel(node.id, icon_data);
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

            if (shelf === EVERYTHING && level === 0 && name
                    && (name.toLocaleLowerCase() === FIREFOX_SHELF_NAME
                            || name.toLocaleLowerCase() === CLOUD_SHELF_NAME))
                name = `${formatShelfName(name)} (imported)`;

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
                        case "size":
                        case "todo_state":
                        case "byte_length":
                            if (property.value)
                                last_object[property.name] = parseInt(property.value);
                            break;
                        case "stored_icon":
                            if (property.value)
                                last_object[property.name] = property.value === "true";
                            break;
                        case "date_added":
                        case "date_modified":
                            let unix_time = new Date().getTime();

                            if (property.value) {
                                unix_time = parseInt(property.value);

                                if (isNaN(unix_time))
                                    unix_time = new Date(property.value).getTime();

                                if (isNaN(unix_time))
                                    unix_time = new Date().getTime();

                                last_object[property.name] = new Date(unix_time);
                            }
                            else
                                last_object[property.name] = new Date(unix_time);

                            break;
                        default:
                            if (property.value)
                                last_object[property.name] = property.value.trim();
                    }
                }

                if (last_object.type === NODE_TYPE_ARCHIVE) {
                    if (last_object.data)
                        last_object.data = JSON.parse(last_object.data);
                }

                if (last_object.notes) {
                    last_object.notes = JSON.parse(last_object.notes);
                }

                if (last_object.notes_html) {
                    last_object.notes_html = JSON.parse(last_object.notes_html);
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

const ORG_EXPORTED_KEYS = ["uuid", "icon", "stored_icon", "type", "size", "details", "date_added", "date_modified",
                           "external", "external_id", "container"];

async function objectToProperties(object) {
    let lines = [];
    let node = await backend.getNode(object.id);

    if (node.external === FIREFOX_SHELF_NAME || node.external === CLOUD_EXTERNAL_NAME) {
        delete node.external;
        delete node.external_id;
    }

    for (let key of ORG_EXPORTED_KEYS) {
        if (node[key]) {
            if (key === "date_added" || key === "date_modified")
                try {
                    if (node[key] instanceof Date)
                        node[key] = node[key].getTime();
                    else
                        node[key] = new Date(node[key]).getTime();

                    if (isNaN(node[key]))
                        node[key] = new Date(node[key]).getTime();
                }
                catch (e) {
                    node[key] = new Date().getTime();
                }

            lines.push(`:${key}: ${node[key]}`);
        }
    }

    if (node.type === NODE_TYPE_ARCHIVE) {
        let blob = await backend.fetchBlob(node.id);
        if (blob) {
            if (blob.type)
                lines.push(`:mime_type: ${blob.type}`);

            if (blob.byte_length)
                lines.push(`:byte_length: ${blob.byte_length}`);

            let content = JSON.stringify(await backend.reifyBlob(blob, true));

            lines.push(`:data: ${content}`);
        }
    }

    if (node.has_notes) {
        let notes = await backend.fetchNotes(node.id);
        if (notes && notes.content) {
            lines.push(`:notes: ${JSON.stringify(notes.content)}`);

            if (notes.html)
                lines.push(`:notes_html: ${JSON.stringify(notes.html)}`);

            if (notes.format)
                lines.push(`:notes_format: ${notes.format}`);

            if (notes.align)
                lines.push(`:notes_align: ${notes.align}`);

            if (notes.width)
                lines.push(`:notes_width: ${notes.width}`);
        }
    }

    if (node.has_comments) {
        let comments = await backend.fetchComments(node.id);
        lines.push(`:comments: ${JSON.stringify(comments)}`);
    }

    let icon = await backend.fetchIcon(node.id);
    if (icon) {
        lines.push(`:icon_data: ${icon}`);
    }

    return lines.map(l => " ".repeat(object.level + 3) + l).join(`\n`);
}

export async function exportOrg(file, nodes, shelf, uuid, shallow) {
    const creationDate = new Date();
    let org_lines = [];

    if (!shallow)
        await file.append(
`#-*- coding: utf-8 -*-
#+EXPORT: Scrapyard
#+VERSION: ${EXPORT_VERSION}
#+NAME: ${shelf}
#+UUID: ${uuid}
#+ENTITIES: ${nodes.length}
#+TIMESTAMP: ${creationDate.getTime()}
#+DATE: ${creationDate.toISOString()}
`);

    await file.append("#+TODO: TODO WAITING POSTPONED | DONE CANCELLED\n");

    for (let node of nodes) {
        if (node.type === NODE_TYPE_SHELF || node.type === NODE_TYPE_GROUP) {
            let line = "\n" + "*".repeat(node.level) + " " + node.name;
            await file.append(line);
        }
        else {
            let line = "\n" + "*".repeat(node.level);

            if (node.todo_state)
                line += " " + TODO_NAMES[node.todo_state];

            let title = node.name || "";
            if (title) {
                title = title.replace("[", "(");
                title = title.replace("]", ")");
            }

            line += " [[" + (node.uri? node.uri: "") + "][" + title + "]]";

            if (node.tags) {
                let tag_list = node.tags.split(",").map(t => t.trim());
                line += "    :" + tag_list.join(":") + ":";
            }

            if (node.todo_date)
                line += "\n    DEADLINE: <" + node.todo_date + ">";

            await file.append(line);
        }

        if (!shallow) {
            let props = `
${" ".repeat(node.level + 1)}:PROPERTIES:
${await objectToProperties(node)}
${" ".repeat(node.level + 1)}:END:`;
            await file.append(props);
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

                    try {
                        const icon = await getFavicon(node.uri);
                        if (icon && typeof icon === "string") {
                            node.icon = icon;
                            await backend.storeIcon(node);
                        }
                        else if (icon) {
                            node.icon = icon.url;
                            await backend.storeIcon(node, icon.response, icon.type);
                        }
                        await backend.updateNode(node);
                    } catch (e) {
                        console.log(e);
                    }
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
        if (line.endsWith(",")) // support for old JSON format files
            object = JSON.parse(line.slice(0, line.length - 1));
        else
            object = JSON.parse(line);
    }
    catch (e) {
        console.log(e)
    }

    return object;
}

function convertJSONDate(date) {
    let unix_time = new Date().getTime();

    if (date) {
        unix_time = parseInt(date);

        if (isNaN(unix_time))
            unix_time = new Date(date).getTime();

        if (isNaN(unix_time))
            unix_time = new Date().getTime();
    }

    return new Date(unix_time);
}

async function importJSONObject(object) {
    let node;

    if (object.date_added)
        object.date_added = convertJSONDate(object.date_added);

    if (object.date_modified)
        object.date_modified = convertJSONDate(object.date_modified);

    delete object.id;
    //delete object.uuid;

    let notes = object.notes;
    delete object.notes;

    let notes_html = object.notes_html;
    delete object.notes_html;

    let notes_format = object.notes_format;
    delete object.notes_format;

    let notes_align = object.notes_align;
    delete object.notes_align;

    let notes_width = object.notes_width;
    delete object.notes_width;

    let comments = object.comments;
    delete object.comments;

    let icon_data = object.icon_data;
    delete object.icon_data;

    if (object.type === NODE_TYPE_ARCHIVE) {
        let data = object.data;
        let byte_length = object.byte_length;

        delete object.data;
        delete object.byte_length;

        node = await backend.importBookmark(object);

        if (data)
            await backend.storeBlobLowLevel(node.id, data, object.mime_type, byte_length);
    }
    else {
        node = await backend.importBookmark(object);
    }

    if (notes) {
        await backend.storeNotesLowLevel({node_id: node.id, content: notes, html: notes_html,
            format: notes_format, align: notes_align, width: notes_width});
    }

    if (comments) {
        await backend.storeCommentsLowLevel(node.id, comments);
    }

    if (icon_data)
        await backend.storeIconLowLevel(node.id, icon_data);

    return node;
}

function renameSpecialShelves(node) {
    if (node && (node.id === FIREFOX_SHELF_ID || node.id === CLOUD_SHELF_ID))
        node.name = `${formatShelfName(node.name)} (imported)`;
}

export async function importJSON(shelf, reader, progress) {
    let lines = reader.lines();
    let meta_line = (await lines.next()).value;

    if (!meta_line)
        return Promise.reject(new Error("invalid file format"));

    meta_line = meta_line.replace(/^\[/, "");
    const meta = parseJSONObject(meta_line);

    let id_map = new Map();
    let first_object = (await lines.next()).value;

    if (!first_object)
        return Promise.reject(new Error("invalid file format"));

    first_object = parseJSONObject(first_object);

    if (!first_object)
        return Promise.reject(new Error("invalid file format"));

    await prepareNewImport(shelf);

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

    renameSpecialShelves(first_object);

    // Do not import "default" shelf, because it is always there, but import as group if aliased
    if (first_object.name.toLocaleLowerCase() !== DEFAULT_SHELF_NAME || aliased_everything) {
        if (aliased_everything && first_object.name.toLocaleLowerCase() === DEFAULT_SHELF_NAME)
            first_object.uuid = UUID.numeric();

        first_object = await importJSONObject(first_object);
        if (first_object_id && isContainer(first_object))
            id_map.set(first_object_id, first_object.id);
    }

    let currentProgress = 0;
    let ctr = 1;

    for await (let line of lines) {
        if (line === "]") // support for the last line in old JSON format files
            break;

        let object = parseJSONObject(line);
        if (object) {
            renameSpecialShelves(object);

            // Do not import "default" shelf, because it is always there (non-aliased import)
            if (object.type === NODE_TYPE_SHELF && object.name.toLocaleLowerCase() === DEFAULT_SHELF_NAME
                && !aliased_everything)
                    continue;
            else if (object.type === NODE_TYPE_SHELF && object.name.toLocaleLowerCase() === DEFAULT_SHELF_NAME
                && aliased_everything)
                object.uuid = UUID.numeric();

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

            if (progress) {
                ctr += 1;
                const newProgress = Math.round((ctr / meta.entities) * 100);
                if (newProgress !== currentProgress) {
                    currentProgress = newProgress;
                    send.importProgress({progress: currentProgress});
                }
            }
        }
    }

    if (progress) {
        console.log(ctr, meta.entities);
        if (ctr !== meta.entities)
            throw new Error("Not all records have been imported.")
    }

    return shelf_node;
}


async function objectToJSON(object) {
    let node = object; //await backend.getNode(object.id);

    delete node.level;
    delete node.tag_list;

    if (node.external === FIREFOX_SHELF_NAME || node.external === CLOUD_EXTERNAL_NAME) {
        delete node.external;
        delete node.external_id;
    }

    for (let key of Object.keys(node)) {
        if (!NODE_PROPERTIES.some(k => k === key))
            delete node[key];

        if (key === "date_added" || key === "date_modified")
            try {
                if (node[key] instanceof Date)
                    node[key] = node[key].getTime();
                else
                    node[key] = new Date(node[key]).getTime();

                if (isNaN(node[key]))
                    node[key] = new Date(node[key]).getTime();
            }
            catch (e) {
                node[key] = new Date().getTime();
            }
    }

    if (node.type === NODE_TYPE_ARCHIVE) {
        let blob = await backend.fetchBlob(node.id);
        if (blob) {
            if (blob.type)
                node.mime_type = blob.type;

            if (blob.byte_length)
                node.byte_length = blob.byte_length;

            node.data = await backend.reifyBlob(blob, true);
        }
    }

    if (node.has_notes) {
        let notes = await backend.fetchNotes(node.id);
        node.notes = notes.content;
        if (notes.html)
            node.notes_html = notes.html;
        if (notes.format)
            node.notes_format = notes.format;
        if (notes.align)
            node.notes_align = notes.align;
        if (notes.width)
            node.notes_width = notes.width;
    }

    if (node.has_comments)
        node.comments = await backend.fetchComments(node.id);

    let icon = await backend.fetchIcon(node.id);
    if (icon)
        node.icon_data = icon;

    return JSON.stringify(node);
}

export async function exportJSON(file, nodes, shelf, uuid, _, comment, progress) {
    const creationDate = new Date();

    const meta = {
        export: "Scrapyard",
        version: EXPORT_VERSION,
        name: shelf,
        uuid: uuid,
        entities: nodes.length,
        timestamp: creationDate.getTime(),
        date: creationDate.toISOString()
    };

    if (comment)
        meta.comment = comment;

    await file.append(JSON.stringify(meta) + (nodes.length? "\n": ""));

    if (nodes.length) {
        const last = nodes.length;
        let currentProgress = 0;
        let ctr = 0;

        for (let node of nodes) {
            let json = await objectToJSON(node);
            ctr += 1;
            await file.append(json + (ctr === last? "" : "\n"));

            if (progress) {
                const newProgress = Math.round((ctr / nodes.length) * 100);
                if (newProgress !== currentProgress) {
                    currentProgress = newProgress;
                    send.exportProgress({progress: currentProgress});
                }
            }
        }

        if (progress)
            send.exportProgress({finished: true});
    }
}


// RDF /////////////////////////////////////////////////////////////////////////////////////////////////////////////////

function traverseRDFTree(doc, visitor) {
    const namespaces = new Map(Object.values(doc.documentElement.attributes)
        .map(a => [a.localName, a.prefix === "xmlns"? a.value: null]));
    const ns_resolver = ns => namespaces.get(ns);
    const NS_NC = ns_resolver("NC");
    const NS_RDF = ns_resolver("RDF");
    const NS_SCRAPBOOK = ns_resolver(Array.from(namespaces.keys()).find(k => (/NS\d+/i).test(k)));

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

// export const SCRAPYARD_LOCK_SCREEN =
//     `<div id="scrapyard-waiting"
//           style="background-color: ${getThemeVar("--theme-background")};
//           z-index: 2147483647;
//           position: fixed;
//           inset: 0px;
//           background-image: url(${browser.runtime.getURL(getThemeVar("--themed-tape-icon"))});
//           background-size: 50mm 50mm;
//           background-repeat: no-repeat;
//           background-position: center center;"></div>`;


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
    }
    catch (e) {
        console.log(e);
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
            parent_id: parent? id_map.get(parent.__sb_id): shelf_node.id,
            todo_state: node.__sb_type === "marked"? 1: undefined,
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

    let cancelListener = function(message, sender, sendResponse) {
        if (message.type === "CANCEL_RDF_IMPORT")
            cancelled = true;
    };

    browser.runtime.onMessage.addListener(cancelListener);


    if (!quick) {
        let progress = 0;
        let parts = bookmarks.length > threads? partition([...bookmarks], threads): bookmarks.map(b => [b]);

        let importf = async (items) => {
            if (items.length) {
                let bookmark = items.shift();
                let scrapbook_id = reverse_id_map.get(bookmark.id);
                let percent = Math.round((++progress / total) * 100);

                try {
                    await importRDFArchive(bookmark, scrapbook_id, rdf_directory);
                }
                catch (e) {
                    send.rdfImportError({bookmark: bookmark, error: e.message});
                }

                send.rdfImportProgress({progress: percent});

                if (!cancelled)
                    await importf(items);
            }
        };

        //let startTime = new Date().getTime() / 1000;
        send.rdfImportProgress({progress: 0});
        await Promise.all(parts.map(bb => importf(bb)));

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
