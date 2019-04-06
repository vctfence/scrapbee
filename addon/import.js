import * as org from "./lib/org.js"
import {backend} from "./backend.js"
import LZString from "./lib/lz-string.js"
import {
    NODE_TYPE_SHELF, NODE_TYPE_GROUP, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, DEFAULT_POSITION, TODO_STATES, TODO_NAMES
} from "./db.js";

const ORG_EXPORT_VERSION = 1;
const EXPORTED_KEYS = ["uuid", "icon", "type", "date_added", "date_modified"];

function traverseOrgNode(node, callback) {
    callback(node);
    if (node.children.length)
        for (let c of node.children)
            traverseOrgNode(c, callback);
}

export async function importOrg(shelf, text) {
    let org_lines = new org.Parser().parse(text);

    let path = [shelf];
    let level = 0;

    let last_object;

    async function importLastObject() {
        if (last_object) {
            // UUIDs currently aren't respected

            if (last_object.type === NODE_TYPE_ARCHIVE) {
                let data = last_object.data;
                let binary = !!last_object.byte_length;

                delete last_object.data;
                delete last_object.byte_length;
                delete last_object.compressed;

                let node = await backend.importBookmark(last_object);

                if (data) {
                    await backend.storeBlob(node.id, data, last_object.mime_type);

                    if (!binary)
                        await backend.storeIndex(node.id, data.indexWords());
                }
            }
            else {
                await backend.importBookmark(last_object);
            }

            last_object = null;
        }
    }

    for (let line of org_lines.nodes) {
        let subnodes = [];
        traverseOrgNode(line, n => subnodes.push(n));
        subnodes = subnodes.filter(n => !(n.type === "inlineContainer"
            || n.type === "text" && !n.value));

        if (subnodes[0].type === "header" && subnodes.some(n => n.type === "link")) {
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
                path: path.join("/")
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
        else if (subnodes[0].type === "drawer" && subnodes[0].name === "PROPERTIES") {
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
                    let compressed = last_object["compressed"];

                    if (last_object.data) {
                        last_object.data = compressed
                            ? LZString.decompressFromBase64(last_object.data)
                            : JSON.parse(last_object.data);

                        if (last_object.byte_length) {
                            let byteArray = new Uint8Array(last_object.byte_length);
                            for (let i = 0; i < last_object.data.length; ++i)
                                byteArray[i] = last_object.data.charCodeAt(i);

                            last_object.data = byteArray;
                        }
                    }
                }
            }
        }
        else if (subnodes[0].type === "text" && /\s*DEADLINE:.*/.test(subnodes[0].value)) {
            let match = /\s*DEADLINE:\s*<([^>]+)>/.exec(subnodes[0].value);

            if (match && match[1] && last_object)
                last_object["todo_date"] = match[1];
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

            let content;

            if (compress) {
                lines.push(`    :compressed: ${compress}`);
                content = LZString.compressToBase64(blob.data);
            }
            else
                content = JSON.stringify(blob.data);

            lines.push(`    :data: ${content}`);
        }
    }

    return lines.join("\n");
}

export async function exportOrg(nodes, shelf, uuid, shallow = false, compress = true) {
    let org_lines = [];

    if (!shallow)
        org_lines.push(
`#EXPORT: Scrapyard
#VERSION: ${ORG_EXPORT_VERSION}
#NAME: ${shelf}
${"#UUID: " + uuid}
`);

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
