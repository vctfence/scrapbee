import * as org from "./lib/org.js"
import {backend} from "./backend.js"
import LZString from "./lib/lz-string.js"
import {
    DONE_SHELF, EVERYTHING, NODE_TYPE_SHELF, NODE_TYPE_GROUP, TODO_SHELF, NODE_TYPE_ARCHIVE,
    TODO_STATES, NODE_TYPE_BOOKMARK
} from "./db.js";

const ORG_EXPORT_VERSION = 1;
const EXPORTED_KEYS = ["uuid", "icon", "type", "pos", "todo_pos", "date_added", "date_modified"];

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
            let data = last_object.data;
            delete last_object.data;

            let index = last_object.index;
            delete last_object.index;

            // UUIDs currently aren't respected

            if (!last_object.type || last_object.type === NODE_TYPE_BOOKMARK) {
                await backend.importBookmark(last_object);
            }
            else if (last_object.type === NODE_TYPE_ARCHIVE) {
                let node = await backend.importBookmark(last_object);

                await backend.db.storeBlob(node.id, data);
                await backend.db.storeIndex(node.id, index);
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
                path: path.join("/")
            };

            if (subnodes[1].type === "text") {
                let todo = subnodes[1].value.trim().toUpperCase();
                if (TODO_STATES[todo])
                    last_object.todo_state = TODO_STATES[todo];
            }

            if (subnodes[subnodes.length - 1].type === "text"
                    && subnodes[subnodes.length - 1].value.indexOf(":") >= 0) {

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
                        case "type":
                        case "pos":
                        case "todo_pos":
                        case "todo_state":
                            last_object[property.name] = parseInt(property.value);
                            break;
                        case "date_added":
                        case "date_modified":
                            last_object[property.name] = new Date(property.value);
                            break;
                        default:
                            last_object[property.name] = property.value;
                    }
                }

                if (last_object.type === NODE_TYPE_ARCHIVE) {
                    last_object.data = LZString.decompressFromBase64(last_object.data).trim();
                    last_object.index = JSON.parse(LZString.decompressFromBase64(last_object.index));
                }
            }
        }
    }

    await importLastObject();
}

async function objectToProperties(node) {
    let lines = [];

    node = await backend.db.getNode(node.id);

    for (let key of EXPORTED_KEYS) {
        if (node[key])
            lines.push(`    :${key}: ${node[key]}`);
    }

    if (node.type === NODE_TYPE_ARCHIVE) {
        let blob = await backend.db.fetchBlob(node.id);
        lines.push(`    :data: ${LZString.compressToBase64(blob.data)}`);

        let index = await backend.db.fetchIndex(node.id);
        lines.push(`    :index: ${LZString.compressToBase64(JSON.stringify(index.words))}`);
    }

    return lines.join("\n");
}

export async function exportOrg(tree, shelf, shallow = false) {
    let special_shelf = shelf === EVERYTHING || shelf === TODO_SHELF || shelf === DONE_SHELF;
    let root = special_shelf
        ? tree._jstree.get_node("#")
        : tree._jstree.get_node(tree.data.find(n => n.type == NODE_TYPE_SHELF).id);
    let skip_level = root.parents.length;
    let level = skip_level;

    let org_lines = [];

    if (!shallow)
        org_lines.push(
`#GENERATOR: Scrapyard
#VERSION: ${ORG_EXPORT_VERSION}
#NAME: ${shelf}
${"#UUID: " + (special_shelf? shelf: root.original.uuid)}
`);

    org_lines.push("#+TODO: TODO WAITING POSTPONED | DONE CANCELLED\n");

    for (let child_id of root.children_d) {
        let node = tree._jstree.get_node(child_id);
        let data = node.original;
        let line_level = node.parents.length - skip_level;

        if (data.type === NODE_TYPE_SHELF || data.type === NODE_TYPE_GROUP) {
            let line = "\n" + "*".repeat(line_level) + " " + data.name;
            org_lines.push(line);
        }
        else {
            let line = "\n" + "*".repeat(line_level);

            if (data.todo_state)
                line += " " + TODO_STATES[data.todo_state];

            line += " [[" + data.uri + "][" + data.name + "]]";

            if (data.tags) {
                let tag_list = data.tags.split(",").map(t => t.trim());
                line += "    :" + tag_list.join(":") + ":";
            }

            org_lines.push(line);
        }

        if (!shallow) {
            let props = `
:PROPERTIES:
${await objectToProperties(data)}
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
