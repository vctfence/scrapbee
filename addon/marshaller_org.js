import {
    isContainerNode,
    EVERYTHING_SHELF_UUID,
    BROWSER_SHELF_NAME,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    TODO_STATE_NAMES,
    TODO_STATES
} from "./storage.js";
import * as org from "./lib/org/org.js";
import {formatShelfName} from "./bookmarking.js";
import {Marshaller, Unmarshaller} from "./marshaller.js";
import {transformFromV1ToV3} from "./import_versions.js";

const STORAGE_FORMAT = "Scrapyard";
const FORMAT_VERSION = 2;
const ORG_EXPORTED_KEYS = ["uuid", "icon", "stored_icon", "type", "size", "details", "date_added", "date_modified",
    "content_modified", "external", "external_id", "container", "content_type", "contains", "site"];

export class MarshallerORG extends Marshaller {
    configure(options) {
        this._stream = options.stream;
        this._linksOnly = options.linksOnly;
    }

    async marshalMeta(options) {
        if (!options.linksOnly) {
            const {name, uuid, objects} = options;
            const now = new Date();

            await this._stream.append(
                `#-*- coding: utf-8 -*-
#+EXPORT: ${STORAGE_FORMAT}
#+VERSION: ${FORMAT_VERSION}
#+NAME: ${name}
#+UUID: ${uuid}
#+ENTITIES: ${objects.length}
#+TIMESTAMP: ${now.getTime()}
#+DATE: ${now.toISOString()}
`);
        }

        await this._stream.append("#+TODO: TODO WAITING POSTPONED | DONE CANCELLED\n");
    }

    async marshal(object) {
        let output;

        if (isContainerNode(object))
            output = this._processContainer(object);
        else
            output = await this._processEndpoint(object);

        await this._stream.append(output);
    }

    _processContainer(object) {
        return "\n" + "*".repeat(object.__level) + " " + (object.name || "");
    }

    async _processEndpoint(object) {
        const level = object.__level;

        let lines = [this._formatHeadline(object, level)];

        function prependSpaces(line, n) {
            return " ".repeat(n) + line;
        }

        if (!this._linksOnly) {
            lines.push(prependSpaces(":PROPERTIES:", level + 1));

            const content = await this.serializeContent(object);
            let property_lines = this._formatProperties(content);
            property_lines = property_lines.map(l => prependSpaces(l, level + 3));
            lines = lines.concat(property_lines);

            lines.push(prependSpaces(":END:", level + 1));
        }

        return lines.join(`\n`);
    }

    _formatHeadline(node, level) {
        let line = "\n" + "*".repeat(level);

        if (node.todo_state)
            line += " " + TODO_STATE_NAMES[node.todo_state];

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

        return line;
    }

    _formatProperties(content) {
        const lines = [];
        const {node, icon, archive, notes, comments} = content;

        for (let key of ORG_EXPORTED_KEYS)
            if (node[key])
                lines.push(`:${key}: ${node[key]}`);

        if (archive) {
            if (archive.type)
                lines.push(`:mime_type: ${archive.type}`);

            if (archive.byte_length)
                lines.push(`:byte_length: ${archive.byte_length}`);

            if (!archive.byte_length)
                archive.object = JSON.stringify(archive.object);

            lines.push(`:data: ${archive.object}`);
        }

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

        if (comments)
            lines.push(`:comments: ${JSON.stringify(comments.text)}`);

        if (icon)
            lines.push(`:icon_data: ${icon.data_url}`);

        return lines;
    }
}

class ORGObjectStream {
    constructor(shelf, text) {
        this._shelf = shelf;
        this.orgLines = new org.Parser().parse(text);
        this._iterator = this.objects();
    }

    getDirectiveValue(name) {
        const directiveNode = this.orgLines.nodes?.find(n => n.type === "directive" && n.directiveName === `${name}:`);
        return directiveNode?.directiveRawValue;
    }

    _getSubnodes(node, acc = []) {
        acc.push(node);

        if (node.children && node.children.length)
            for (let c of node.children)
                this._getSubnodes(c, acc);

        return acc;
    }

    _getOrgItems(orgNode) {
        let subnodes = this._getSubnodes(orgNode);
        return subnodes.filter(n => !(n.type === "inlineContainer" || n.type === "text" && !n.value));
    }

    _isLinkHeadline(orgItems) {
        return orgItems[0].type === "header" && orgItems.some(n => n.type === "link");
    }

    _isTextHeadline(orgItems) {
        return orgItems.length > 1 && orgItems[0].type === "header" && orgItems[1].type === "text";
    }

    _isPropertyDrawer(orgItems) {
        return orgItems[0].type === "drawer" && orgItems[0].name === "PROPERTIES";
    }

    _isDeadline(orgItems) {
        return orgItems.length > 1 && orgItems[0].type === "paragraph" && orgItems[1].type === "text"
                    && /\s*DEADLINE:.*/.test(orgItems[1].value)
    }

    _isParagraph(orgItems) {
        return orgItems.length > 1 && orgItems[0].type === "paragraph" && orgItems[1].type === "text";
    }

    _exitDirectory(orgItems, path, level) {
        while (level >= orgItems[0].level) {
            path.pop();
            level -= 1;
        }
        return level;
    }

    _enterDirectory(dirName, path, level) {
        level += 1;
        path.push(dirName);
        return level;
    }

    *objects() {
        let level = 0;
        let path = this._shelf === EVERYTHING_SHELF_UUID ? [] : [this._shelf];

        let lastObject;
        let orgNodes = this.orgLines.nodes;

        this.version = parseInt(this.getDirectiveValue("version")) || 1;

        for (let i = 0; i < orgNodes.length; ++i) {
            let orgNode = orgNodes[i];
            let orgItems = this._getOrgItems(orgNode);

            if (!orgItems.length)
                continue;

            //console.log(orgItems)

            if (this._isLinkHeadline(orgItems)) {
                if (lastObject)
                    yield lastObject;

                if (level >= orgItems[0].level)
                    level = this._exitDirectory(orgItems, path, level);

                lastObject = this._processHeadline(orgItems, path);
            }
            else if (this._isTextHeadline(orgItems)) {
                if (lastObject) {
                    yield lastObject;
                    lastObject = null;
                }

                let dirName = orgItems[1].value;

                if (level === 0 && this._shelf === EVERYTHING_SHELF_UUID && dirName && dirName.toLowerCase() === BROWSER_SHELF_NAME)
                    dirName = `${formatShelfName(dirName)} (imported)`;

                if (level < orgItems[0].level)
                    level = this._enterDirectory(dirName, path, level);
                else {
                    level = this._exitDirectory(orgItems, path, level);
                    level = this._enterDirectory(dirName, path, level);
                }
            }
            else if (lastObject && this._isPropertyDrawer(orgItems)) {
                this._processProperties(orgItems, lastObject);
            }
            else if (lastObject && this._isDeadline(orgItems)) {
                this._processTODODate(orgItems, lastObject);
            }
            else if (lastObject && this._isParagraph(orgItems)) {
                lastObject.note_lines.push(orgItems[1].value);
            }
        }

        yield lastObject;
    }

    _processHeadline(orgItems, path) {
        let link = orgItems.find(n => n.type === "link");
        let index = orgItems.indexOf(link);

        let result = {
            uri: link.src,
            name: orgItems[index + 1].value,
            type: NODE_TYPE_BOOKMARK,
            path: path.join("/"),
            note_lines: []
        };

        if (orgItems[1].type === "text") {
            let todo = orgItems[1].value.trim().toUpperCase();
            if (TODO_STATES[todo])
                result.todo_state = TODO_STATES[todo];
        }

        if (orgItems.length > 3 && orgItems[orgItems.length - 1].type === "text"
            && /^:.*:$/.test(orgItems[orgItems.length - 1].value.trim())) {

            result.tags = orgItems[orgItems.length - 1].value.trim()
                .split(":")
                .map(t => t.trim())
                .filter(t => !!t)
                .join(",");
        }

        return result;
    }

    _processProperties(orgItems, object) {
        orgItems.shift();

        for (let property of orgItems) {
            switch (property.name) {
                case "pos":
                    break;
                case "type":
                case "size":
                case "byte_length":
                    if (property.value)
                        object[property.name] = parseInt(property.value);
                    break;
                case "stored_icon":
                    if (property.value)
                        object[property.name] = property.value === "true";
                    break;
                default:
                    if (property.value)
                        object[property.name] = property.value.trim();
            }
        }

        if (object.type === NODE_TYPE_ARCHIVE) {
            if (object.data) {
                if (this.version === 1) {
                    object.data = JSON.parse(object.data);
                    if (object.byte_length)
                        object.data = btoa(JSON.parse(object.data));
                }
                else if (this.version === 2 && !object.byte_length)
                    object.data = JSON.parse(object.data);
            }
        }

        if (object.notes) {
            object.notes = JSON.parse(object.notes);
            object.has_notes = true;

            if (object.notes_html)
                object.notes_html = JSON.parse(object.notes_html);
        }
        else if (object.note_lines.length) {
            object.notes = object.note_lines.join("\n");
            object.notes_format = "org";
            object.has_notes = true;
        }

        if (object.comments) {
            object.comments = JSON.parse(object.comments);
            object.has_comments = true;
        }
    }

    _processTODODate(orgItems, object) {
        let match = /\s*DEADLINE:\s*<([^>]+)>/.exec(orgItems[1].value);

        if (match && match[1] && object)
            object["todo_date"] = match[1];
    }

    read() {
        const item = this._iterator.next();
        if (item.done)
            return undefined;
        return item.value;
    }
}

export class UnmarshallerORG extends Unmarshaller {
    configure(options) {
        this._stream = new ORGObjectStream(options.name, options.stream);
    }

    unmarshalMeta() {
        const fullExport = !!this._stream.getDirectiveValue("export");

        let meta;
        if (fullExport) {
            meta = {
                version: parseInt(this._stream.getDirectiveValue("version")) || 1,
                entities: parseInt(this._stream.getDirectiveValue("entities"))
            }

            if (meta.version > FORMAT_VERSION)
                throw new Error("export format version is not supported");
        }
        else
            this.setForceLoadIcons();

        return meta;
    }

    async unmarshal() {
        let object = this._stream.read();

        if (object) {
            object = transformFromV1ToV3(object, this._stream.version);
            await this.storeContent(object);
            return object;
        }
    }
}
