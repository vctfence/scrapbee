import {bookmarkManager} from "./backend.js";
import {
    CLOUD_EXTERNAL_NAME,
    CLOUD_SHELF_NAME,
    DEFAULT_POSITION,
    EVERYTHING,
    FIREFOX_SHELF_NAME,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    TODO_NAMES,
    TODO_STATES
} from "./storage.js";
import * as org from "./lib/org/org.js";
import {prepareNewImport} from "./import.js";
import {formatShelfName} from "./bookmarking.js";

const FORMAT_VERSION = 2;

function traverseOrgNode(node, callback) {
    callback(node);
    if (node.children && node.children.length)
        for (let c of node.children)
            traverseOrgNode(c, callback);
}

export async function importOrg(shelf, text) {
    let path = shelf === EVERYTHING ? [] : [shelf];
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

                node = await bookmarkManager.importBookmark(last_object);

                if (data)
                    await bookmarkManager.storeIndexedBlob(node.id, data, last_object.mime_type, byte_length);
            }
            else {
                node = await bookmarkManager.importBookmark(last_object);
            }

            if (notes) {
                await bookmarkManager.storeIndexedNotes({
                    node_id: node.id, content: notes, html: notes_html,
                    format: notes_format, align: notes_align, width: notes_width
                });
            }
            else if (note_lines.length) {
                await bookmarkManager.storeIndexedNotes({node_id: node.id, content: note_lines.join("\n"), format: "org"});
            }

            if (comments) {
                await bookmarkManager.storeIndexedComments(node.id, JSON.parse(comments));
            }

            if (icon_data) {
                await bookmarkManager.storeIconLowLevel(node.id, icon_data);
            }

            last_object = null;
        }
    };

    let org_lines = new org.Parser().parse(text);
    const version_directive = org_lines?.nodes?.find(n => n.type === "directive" && n.directiveName === "version:");
    const version = parseInt(version_directive?.directiveRawValue) || 1;

    if (version > FORMAT_VERSION)
        return Promise.reject(new Error("export format is not supported"));

    await prepareNewImport(shelf);

    for (let line of org_lines.nodes) {
        let subnodes = [];
        traverseOrgNode(line, n => subnodes.push(n));
        subnodes = subnodes.filter(n => !(n.type === "inlineContainer"
            || n.type === "text" && !n.value));

        //console.log(subnodes)

        if (subnodes.length && subnodes[0].type === "header" && subnodes.some(n => n.type === "link")) {
            await importLastObject();

            if (level >= subnodes[0].__level) {
                while (level >= subnodes[0].__level) {
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

            if (level < subnodes[0].__level) {
                level += 1;
                path.push(name);
            }
            else {
                while (level >= subnodes[0].__level) {
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
                    if (last_object.data) {
                        if (version === 1)
                            last_object.data = JSON.parse(last_object.data);
                        else if (version === 2) {
                            if (last_object.byte_length)
                                last_object.data = atob(last_object.data);
                            else
                                last_object.data = JSON.parse(last_object.data);
                        }
                    }
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
    "external", "external_id", "container", "content_type"];

async function objectToProperties(object) {
    let lines = [];
    let node = await bookmarkManager.getNode(object.id);

    if (node.external === FIREFOX_SHELF_NAME || node.external === CLOUD_EXTERNAL_NAME) {
        delete node.external;
        delete node.external_id;
    }

    for (let key of ORG_EXPORTED_KEYS) {
        if (node[key]) {
            if (key === "date_added" || key === "date_modified") {
                if (node[key] instanceof Date)
                    node[key] = node[key].getTime();
                else
                    node[key] = new Date(node[key]).getTime();

                if (isNaN(node[key]))
                    node[key] = new Date(0).getTime();
            }

            lines.push(`:${key}: ${node[key]}`);
        }
    }

    if (node.type === NODE_TYPE_ARCHIVE) {
        let blob = await bookmarkManager.fetchBlob(node.id);
        if (blob) {
            if (blob.type)
                lines.push(`:mime_type: ${blob.type}`);

            if (blob.byte_length)
                lines.push(`:byte_length: ${blob.byte_length}`);

            let content = await bookmarkManager.reifyBlob(blob, true);
            if (blob.byte_length)
                content = btoa(content);
            else
                content = JSON.stringify(content);

            lines.push(`:data: ${content}`);
        }
    }

    if (node.has_notes) {
        let notes = await bookmarkManager.fetchNotes(node.id);
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
        let comments = await bookmarkManager.fetchComments(node.id);
        lines.push(`:comments: ${JSON.stringify(comments)}`);
    }

    let icon = await bookmarkManager.fetchIcon(node.id);
    if (icon) {
        lines.push(`:icon_data: ${icon}`);
    }

    return lines.map(l => " ".repeat(object.__level + 3) + l).join(`\n`);
}

export async function exportOrg(file, nodes, shelf, uuid, shallow) {
    const creationDate = new Date();
    let org_lines = [];

    if (!shallow)
        await file.append(
            `#-*- coding: utf-8 -*-
#+EXPORT: Scrapyard
#+VERSION: ${FORMAT_VERSION}
#+NAME: ${shelf}
#+UUID: ${uuid}
#+ENTITIES: ${nodes.length}
#+TIMESTAMP: ${creationDate.getTime()}
#+DATE: ${creationDate.toISOString()}
`);

    await file.append("#+TODO: TODO WAITING POSTPONED | DONE CANCELLED\n");

    for (let node of nodes) {
        if (node.type === NODE_TYPE_SHELF || node.type === NODE_TYPE_GROUP) {
            let line = "\n" + "*".repeat(node.__level) + " " + (node.name || "");
            await file.append(line);
        }
        else {
            let line = "\n" + "*".repeat(node.__level);

            if (node.todo_state)
                line += " " + TODO_NAMES[node.todo_state];

            let title = node.name || "";
            if (title) {
                title = title.replace("[", "(");
                title = title.replace("]", ")");
            }

            line += " [[" + (node.uri ? node.uri : "") + "][" + title + "]]";

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
${" ".repeat(node.__level + 1)}:PROPERTIES:
${await objectToProperties(node)}
${" ".repeat(node.__level + 1)}:END:`;
            await file.append(props);
        }
    }
}
