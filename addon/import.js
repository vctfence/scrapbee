import * as org from "./org.js"
import {backend} from "./backend.js"
//import LZString from "./lib/lz-string.js"
import {
    NODE_TYPE_SHELF,
    NODE_TYPE_GROUP,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    DEFAULT_POSITION,
    TODO_STATES,
    TODO_NAMES,
    EVERYTHING
} from "./db.js";

const ORG_EXPORT_VERSION = 1;
const EXPORTED_KEYS = ["uuid", "icon", "type", "details", "date_added", "date_modified"];

function traverseOrgNode(node, callback) {
    callback(node);
    if (node.children && node.children.length)
        for (let c of node.children)
            traverseOrgNode(c, callback);
}

export async function importOrg(shelf, text) {
    let org_lines = new org.Parser().parse(text);
    let compressed = org_lines.directiveValues["compressed:"] && org_lines.directiveValues["compressed:"] === "t";

    let path = shelf === EVERYTHING? []: [shelf];
    let level = 0;

    let last_object;

    async function importLastObject() {
        if (last_object) {
            // UUIDs currently aren't respected

            let node;

            let notes = last_object.notes;
            delete last_object.notes;

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
                backend.storeNotes(node.id, notes);
            }
            else if (note_lines.length) {
                backend.storeNotes(node.id, note_lines.join("\n"));
            }

            last_object = null;
        }
    }

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

            if (level < subnodes[0].level) {
                level += 1;
                path.push(subnodes[1].value);
            }
            else {
                while (level >= subnodes[0].level) {
                    path.pop();
                    level -= 1;
                }
                level += 1;
                path.push(subnodes[1].value);
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
                        case "todo_pos":
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
                && /\s*DEADLINE:.*/.test(subnodes[0].value)) {

            let match = /\s*DEADLINE:\s*<([^>]+)>/.exec(subnodes[0].value);

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

async function objectToProperties(node, compress) {
    let lines = [];

    node = await backend.getNode(node.id);

    for (let key of EXPORTED_KEYS) {
        if (node[key])
            lines.push(`    :${key}: ${node[key]}`);
    }

    if (node.type === NODE_TYPE_ARCHIVE) {
        let blob = await backend.fetchBlob(node.id);
        if (blob) {
            if (blob.type)
                lines.push(`    :mime_type: ${blob.type}`);

            if (blob.byte_length)
                lines.push(`    :byte_length: ${blob.byte_length}`);

            let content = compress
                ? null //LZString.compressToBase64(blob.data)
                : JSON.stringify(blob.data);

            lines.push(`    :data: ${content}`);
        }
    }

    let notes = await backend.fetchNotes(node.id);
    if (notes && notes.content) {
        let content = compress
            ? null //LZString.compressToBase64(notes.content)
            : JSON.stringify(notes.content);

        lines.push(`    :notes: ${content}`);
    }

    return lines.join("\n");
}

export async function exportOrg(nodes, shelf, uuid, shallow = false, compress = false) {
    let org_lines = [];

    if (!shallow)
        org_lines.push(
`#+EXPORT: Scrapyard
#+VERSION: ${ORG_EXPORT_VERSION}
#+NAME: ${shelf}
${"#+UUID: " + uuid}
`);

    if (compress)
        org_lines.push("#+COMPRESSED: t\n");

    org_lines.push("#+TODO: TODO WAITING POSTPONED | DONE CANCELLED\n");

    for (let node of nodes) {
        if (node.type === NODE_TYPE_SHELF || node.type === NODE_TYPE_GROUP) {
            let line = "\n" + "*".repeat(node.level) + " " + node.name;
            org_lines.push(line);
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

            org_lines.push(line);
        }

        if (!shallow) {
            let props = `
:PROPERTIES:
${await objectToProperties(node, compress)}
:END:`;
            org_lines.push(props);
        }
    }

    let blob = new Blob(org_lines, { type : "text/plain" });
    let url = URL.createObjectURL(blob);

    setTimeout(function() {
        window.URL.revokeObjectURL(url);
    },100);

    return url;
}

export async function importHtml(shelf, text) {
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
