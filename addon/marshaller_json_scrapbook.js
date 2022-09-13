import {Marshaller, Unmarshaller} from "./marshaller.js";
import {Archive, Comments, Icon, Node, Notes} from "./storage_entities.js";
import {
    DEFAULT_SHELF_UUID,
    NODE_TYPE_NAMES,
    NODE_TYPES,
    TODO_STATES,
    TODO_STATE_NAMES,
    NODE_TYPE_ARCHIVE
} from "./storage.js";

export const JSON_SCRAPBOOK_FORMAT = "JSON Scrapbook";
export const JSON_SCRAPBOOK_VERSION = 1;

const ARCHIVE_TYPE_BYTES = "bytes";
const ARCHIVE_TYPE_TEXT = "text";

const SERIALIZED_FIELD_ORDER = [
    "type",
    "uuid",
    "parent",
    "title",
    "url",
    "content_type",
    "size",
    "tags",
    "date_added",
    "date_modified",
    "content_modified",
    "external",
    "external_id",
    "stored_icon",
    "has_comments",
    "has_notes",
    "todo_state",
    "todo_date",
    "details",
    "pos"
];

export class MarshallerJSONScrapbook extends Marshaller {
    configure(options) {
        this._stream = options.stream;
    }

    async serializeNode(node) {
        node = {...node};

        this._resetNodeDates(node);

        const serializedNode = this.preprocessNode(node);

        delete serializedNode.id;
        if (node.parent_id) {
            serializedNode.parent = await Node.getUUIDFromId(node.parent_id);
            delete serializedNode.parent_id;
        }

        serializedNode.url = node.uri;
        delete serializedNode.uri;

        serializedNode.title = node.name;
        delete serializedNode.name;

        serializedNode.type = NODE_TYPE_NAMES[node.type];

        if (serializedNode.stored_icon || serializedNode.icon)
            delete serializedNode.icon;

        serializedNode.has_icon = serializedNode.stored_icon;
        delete serializedNode.stored_icon;

        serializedNode.todo_state = TODO_STATE_NAMES[node.todo_state];

        return this._reorderFields(serializedNode);
    }

    _resetNodeDates(node) {
        if (node.uuid === DEFAULT_SHELF_UUID) {
            node.date_added = 0;
            node.date_modified = 0;
        }
    }

    _reorderFields(node) {
        const entries = Object.entries(node);
        let orderedEntries = [];

        for (const field of SERIALIZED_FIELD_ORDER) {
            const entry = entries.find(e => e[0] === field);

            if (entry) {
                orderedEntries.push(entry);
                entries.splice(entries.indexOf(entry), 1);
            }
        }

        orderedEntries = [...orderedEntries, ...entries];

        return Object.fromEntries(orderedEntries);
    }

    serializeIcon(icon) {
        icon = {...icon};

        delete icon.id;
        delete icon.node_id;

        icon.url = icon.data_url;
        delete icon.data_url;

        return icon;
    }

    serializeIndex(index) {
        index = {...index};

        delete index.id;
        delete index.node_id;

        index.content = index.words;
        delete index.words;

        return index;
    }

    async serializeArchive(archive) {
        archive = {...archive};

        delete archive.id;
        delete archive.node_id;

        archive = await this.preprocessArchive(archive);

        if (archive.type)
            archive.content_type = archive.type || "text/html";

        archive.type = archive.byte_length? ARCHIVE_TYPE_BYTES: ARCHIVE_TYPE_TEXT;
        delete archive.byte_length;

        archive.content = archive.object;
        delete archive.object;

        return archive;
    }

    serializeNotes(notes) {
        notes = {...notes};

        delete notes.id;
        delete notes.node_id;
        return notes;
    }

    serializeComments(text) {
        const comments = {content: text};

        return comments;
    }

    async marshalMeta(options) {
        const {comment, uuid, objects, name} = options;
        const now = new Date();

        const meta = {
            format: JSON_SCRAPBOOK_FORMAT,
            version: JSON_SCRAPBOOK_VERSION,
            type: "export",
            uuid: uuid,
            entities: objects.length,
            timestamp: now.getTime(),
            date: now.toISOString()
        };

        if (comment)
            meta.comment = comment;

        await this._stream.append(JSON.stringify(meta));
    }

    async assembleContent(node) {
        const result = {node: await this.serializeNode(node)};

        if (node.type === NODE_TYPE_ARCHIVE) {
            let archive = await Archive.get(node);
            if (archive)
                result.archive = await this.serializeArchive(archive);
        }

        if (node.has_notes) {
            let notes = await Notes.get(node);
            if (notes)
                result.notes = this.serializeNotes(notes);
        }

        if (node.has_comments)
            result.comments = this.serializeComments(await Comments.get(node));

        if (node.icon && node.stored_icon) {
            const icon = Icon.entity(node, await Icon.get(node.id));
            result.icon = this.serializeIcon(icon);
        }

        return result;
    }

    async marshal(object) {
        const content = await this.assembleContent(object);
        const output = "\n" + JSON.stringify(content);

        return this._stream.append(output);
    }
}

export class UnmarshallerJSONScrapbook extends Unmarshaller {
    _stream;
    _nextId = 2;
    _uuidToId = new Map();

    configure(options) {
        this._stream = options.stream;
        this._uuidToId.set(DEFAULT_SHELF_UUID, 1);
    }

    async deserializeNode(node) {
        const deserializedNode = {...node};

        deserializedNode.uri = node.url;
        delete deserializedNode.url;

        deserializedNode.name = node.title;
        delete deserializedNode.title;

        deserializedNode.type = NODE_TYPES[node.type];

        deserializedNode.todo_state = TODO_STATES[node.todo_state];

        deserializedNode.stored_icon = deserializedNode.has_icon;
        delete deserializedNode.has_icon;

        return deserializedNode;
    }

    deserializeIcon(icon) {
        icon = {...icon};

        icon.data_url = icon.url;
        delete icon.url;

        return icon;
    }

    deserializeIndex(index) {
        index = {...index};

        index.words = index.content;
        delete index.content;

        return index;
    }

    deserializeArchive(archive) {
        archive = {...archive};
        const archiveType = archive.type;

        archive.type = archive.content_type;
        delete archive.content_type;

        archive.object = archive.content;
        delete archive.content;

        if (archiveType === ARCHIVE_TYPE_BYTES)
            archive.byte_length = true;

        return archive;
    }

    deserializeNotes(notes) {
        return notes;
    }

    deserializeComments(comments) {
        comments.text = comments.content;
        delete comments.content;

        return comments;
    }

    async unmarshalMeta() {
        let metaLine = await this._stream.read();

        if (!metaLine)
            throw new Error("Invalid file format.");

        metaLine = metaLine.replace(/^\[/, "");
        metaLine = metaLine.replace(/,$/, "");
        const meta = JSON.parse(metaLine);

        if (!meta)
            throw new Error("Invalid file format.");

        if (meta.format === JSON_SCRAPBOOK_FORMAT && meta.version > JSON_SCRAPBOOK_VERSION)
            throw new Error("Export format version is not supported.");

        return meta;
    }

    async unmarshal() {
        let input = await this._stream.read();

        if (input) {
            const object = JSON.parse(input);

            await this.deserializeContent(object);

            object.persist = () => this.storeContent(object);
            return object;
        }
    }

    async deserializeContent(object) {
        object.node = await this.deserializeNode(object.node);
        this._findParentNode(object.node);

        if (object.archive)
            object.archive = await this.deserializeArchive(object.archive);

        if (object.notes)
            object.notes = this.deserializeNotes(object.notes);

        if (object.comments)
            object.comments = this.deserializeComments(object.comments);

        if (object.icon) {
            object.icon = this.deserializeIcon(object.icon);
            object.node.icon = await Icon.computeHash(object.icon.data_url)
        }

        return object;
    }

    _findParentNode(node) {
        node.id = this._nextId++;
        this._uuidToId.set(node.uuid, node.id);

        if (node.parent) {
            node.parent_id = this._uuidToId.get(node.parent);
            delete node.parent;
        }
    }
}
