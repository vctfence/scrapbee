import {
    CLOUD_EXTERNAL_NAME,
    CLOUD_SHELF_ID,
    DEFAULT_SHELF_ID,
    DEFAULT_SHELF_NAME,
    EVERYTHING,
    FIREFOX_SHELF_ID,
    FIREFOX_SHELF_NAME,
    isContainer,
    NODE_PROPERTIES,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
} from "./storage_constants.js";
import {importJSONObject_v1, parseJSONObject_v1} from "./import_json_v1.js"
import {backend, formatShelfName} from "./backend.js";
import UUID from "./lib/uuid.js";
import {send} from "./proxy.js";
import {prepareNewImport} from "./import.js";
import {cleanObject} from "./utils.js";

const FORMAT_VERSION = 2;

async function importJSONObject(object) {
    if (!object.name)
        object.name = "";

    if (object.date_added)
        object.date_added = new Date(object.date_added);

    if (object.date_modified)
        object.date_modified = new Date(object.date_added);

    delete object.id;

    let notes = object.notes;
    delete object.notes;

    let comments = object.comments;
    delete object.comments;

    let icon_data = object.icon_data;
    delete object.icon_data;

    let node;

    if (object.type === NODE_TYPE_ARCHIVE) {
        let blob = object.blob;
        delete object.blob;

        node = await backend.importBookmark(object);

        if (blob) {
            if (blob.byte_length)
                blob.object = atob(blob.object);
            await backend.storeBlobLowLevel(node.id, blob.object, blob.type, blob.byte_length);
        }
    }
    else {
        node = await backend.importBookmark(object);
    }

    if (notes) {
        notes.node_id = node.id;
        await backend.storeNotesLowLevel(notes);
    }

    if (comments)
        await backend.storeCommentsLowLevel(node.id, comments);

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
    meta_line = meta_line.replace(/,$/, "");
    const meta = JSON.parse(meta_line);

    if (!meta)
        return Promise.reject(new Error("invalid file format"));

    if (meta.version > FORMAT_VERSION)
        return Promise.reject(new Error("export format is not supported"));

    let parseJSONObjectImpl = JSON.parse;
    let importJSONObjectImpl = importJSONObject;

    switch (meta.version) {
        case 1:
            parseJSONObjectImpl = parseJSONObject_v1;
            importJSONObjectImpl = importJSONObject_v1;
            break;
    }

    let id_map = new Map();
    let first_object = (await lines.next()).value;

    if (!first_object)
        return Promise.reject(new Error("invalid file format"));

    first_object = parseJSONObjectImpl(first_object);

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

    let shelf_node = shelf !== EVERYTHING ? await backend.getGroupByPath(shelf) : null;
    if (shelf_node) {
        id_map.set(first_object.parent_id, shelf_node.id); // root id
        first_object.parent_id = shelf_node.id;
    }

    let first_object_id = first_object.id;

    renameSpecialShelves(first_object);

    // Do not import "default" shelf, because it is always there, but import as group if aliased
    if (first_object.name?.toLocaleLowerCase() !== DEFAULT_SHELF_NAME || aliased_everything) {
        if (aliased_everything && first_object.name?.toLocaleLowerCase() === DEFAULT_SHELF_NAME)
            first_object.uuid = UUID.numeric();

        first_object = await importJSONObjectImpl(first_object);
        if (first_object_id && isContainer(first_object))
            id_map.set(first_object_id, first_object.id);
    }

    let currentProgress = 0;
    let ctr = 1;

    for await (let line of lines) {
        if (meta.version === 1 && line === "]") // support for the last line in old JSON format files
            break;

        let object = parseJSONObjectImpl(line);
        if (object) {
            renameSpecialShelves(object);

            // Do not import "default" shelf, because it is always there (non-aliased import)
            if (object.type === NODE_TYPE_SHELF && object.name?.toLocaleLowerCase() === DEFAULT_SHELF_NAME
                && !aliased_everything) {
                ctr += 1;
                continue;
            }
            else if (object.type === NODE_TYPE_SHELF && object.name?.toLocaleLowerCase() === DEFAULT_SHELF_NAME
                && aliased_everything)
                object.uuid = UUID.numeric();

            let old_object_id = object.id;

            if (object.parent_id)
                object.parent_id = id_map.get(object.parent_id);
            else if (object.type === NODE_TYPE_SHELF && aliased_everything) {
                object.type = NODE_TYPE_GROUP;
                object.parent_id = shelf_node.id;
            }

            object = await importJSONObjectImpl(object);

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
        if (ctr !== meta.entities)
            throw new Error("some records are missing")
    }

    return shelf_node;
}

async function objectToJSON(object) {
    let node = cleanObject(object);

    for (let key of Object.keys(node)) {
        if (!NODE_PROPERTIES.some(k => k === key))
            delete node[key];

        if (key === "date_added" || key === "date_modified") {
            if (node[key] instanceof Date)
                node[key] = node[key].getTime();
            else
                node[key] = new Date(node[key]).getTime();

            if (isNaN(node[key]))
                node[key] = new Date(0).getTime();
        }
    }

    if (!node.name)
        node.name = "";

    delete node.tag_list;

    if (node.external === FIREFOX_SHELF_NAME) {
        delete node.external;
        delete node.external_id;
    }

    if (node.type === NODE_TYPE_ARCHIVE) {
        let blob = await backend.fetchBlob(node.id);
        if (blob) {
            let content = await backend.reifyBlob(blob, true);

            delete blob.id;
            delete blob.data;
            delete blob.node_id;

            if (blob.byte_length)
                content = btoa(content);

            blob.object = content;
            node.blob = cleanObject(blob);
        }
    }

    if (node.has_notes) {
        let notes = await backend.fetchNotes(node.id);
        if (notes) {
            delete notes.id;
            delete notes.node_id;
            node.notes = cleanObject(notes);
        }
    }

    if (node.has_comments)
        node.comments = await backend.fetchComments(node.id);

    if (node.icon && node.stored_icon) {
        let icon = await backend.fetchIcon(node.id);
        node.icon_data = icon;
    }

    return JSON.stringify(node);
}

export async function exportJSON(file, nodes, shelf, uuid, _, comment, progress) {
    const creationDate = new Date();

    const meta = {
        export: "Scrapyard",
        version: FORMAT_VERSION,
        name: shelf,
        uuid: uuid,
        entities: nodes.length,
        timestamp: creationDate.getTime(),
        date: creationDate.toISOString()
    };

    if (comment)
        meta.comment = comment;

    await file.append(JSON.stringify(meta));

    if (nodes.length)
        await file.append("\n");

    if (nodes.length) {
        const last = nodes.length;
        let currentProgress = 0;
        let ctr = 0;

        for (let node of nodes) {
            await file.append(await objectToJSON(node));

            if (++ctr !== last)
                 await file.append("\n");

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

