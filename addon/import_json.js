import {
    isContainer,
    CLOUD_SHELF_ID,
    DEFAULT_SHELF_ID,
    DEFAULT_SHELF_NAME, DONE_SHELF_UUID,
    EVERYTHING,
    FIREFOX_SHELF_ID,
    FIREFOX_SHELF_NAME,
    NODE_PROPERTIES,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF, TODO_SHELF_UUID,
} from "./storage.js";
import {importJSONObject_v1, parseJSONObject_v1} from "./import_json_v1.js"
import {bookmarkManager} from "./backend.js";
import UUID from "./lib/uuid.js";
import {send} from "./proxy.js";
import {prepareNewImport} from "./import.js";
import {cleanObject} from "./utils.js";
import {formatShelfName} from "./bookmarking.js";

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

        node = await bookmarkManager.importBookmark(object);

        if (blob) {
            if (blob.byte_length)
                blob.object = atob(blob.object);
            await bookmarkManager.storeIndexedBlob(node.id, blob.object, blob.type, blob.byte_length);
        }
    }
    else {
        node = await bookmarkManager.importBookmark(object);
    }

    if (notes) {
        notes.node_id = node.id;
        await bookmarkManager.storeIndexedNotes(notes);
    }

    if (comments)
        await bookmarkManager.storeIndexedComments(node.id, comments);

    if (icon_data)
        await bookmarkManager.storeIconLowLevel(node.id, icon_data);

    return node;
}

function renameSpecialShelves(node) {
    if (node && (node.id === FIREFOX_SHELF_ID || node.id === CLOUD_SHELF_ID))
        node.name = `${formatShelfName(node.name)} (imported)`;
}

export async function importJSON(shelf, reader, progress) {
    let lines = reader.lines();
    let metaLine = (await lines.next()).value;

    if (!metaLine)
        return Promise.reject(new Error("invalid file format"));

    metaLine = metaLine.replace(/^\[/, "");
    metaLine = metaLine.replace(/,$/, "");
    const meta = JSON.parse(metaLine);

    if (!meta)
        return Promise.reject(new Error("invalid file format"));

    if (meta.version > FORMAT_VERSION)
        return Promise.reject(new Error("export format is not supported"));

    const todo = meta.uuid === TODO_SHELF_UUID || meta.uuid === DONE_SHELF_UUID;

    let parseJSONObjectImpl = JSON.parse;
    let importJSONObjectImpl = importJSONObject;

    switch (meta.version) {
        case 1:
            parseJSONObjectImpl = parseJSONObject_v1;
            importJSONObjectImpl = importJSONObject_v1;
            break;
    }

    let idMap = new Map();
    let firstObject = (await lines.next()).value;

    if (!firstObject)
        return Promise.reject(new Error("invalid file format"));

    firstObject = parseJSONObjectImpl(firstObject);

    if (!firstObject)
        return Promise.reject(new Error("invalid file format"));

    await prepareNewImport(shelf);

    let aliasedEverything = !firstObject.parent_id && shelf !== EVERYTHING;

    if (aliasedEverything) {
        firstObject.parent_id = null;
        firstObject.type = NODE_TYPE_GROUP;
    }
    else
        idMap.set(DEFAULT_SHELF_ID, DEFAULT_SHELF_ID);

    let shelfNode = shelf !== EVERYTHING ? await bookmarkManager.getGroupByPath(shelf) : null;
    if (shelfNode) {
        idMap.set(firstObject.parent_id, shelfNode.id); // root id
        firstObject.parent_id = shelfNode.id;
    }

    let firstObjectId = firstObject.id;

    renameSpecialShelves(firstObject);

    // Do not import "default" shelf, because it is always there, but import as group if aliased
    if (firstObject.name?.toLocaleLowerCase() !== DEFAULT_SHELF_NAME || aliasedEverything) {
        if (aliasedEverything && firstObject.name?.toLocaleLowerCase() === DEFAULT_SHELF_NAME)
            firstObject.uuid = UUID.numeric();

        firstObject = await importJSONObjectImpl(firstObject);
        if (firstObjectId && isContainer(firstObject))
            idMap.set(firstObjectId, firstObject.id);
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
                && !aliasedEverything) {
                ctr += 1;
                continue;
            }
            else if (object.type === NODE_TYPE_SHELF && object.name?.toLocaleLowerCase() === DEFAULT_SHELF_NAME
                && aliasedEverything)
                object.uuid = UUID.numeric();

            let oldObjectId = object.id;

            if (object.parent_id) {
                if (todo)
                    object.parent_id = shelfNode.id
                else
                    object.parent_id = idMap.get(object.parent_id);
            }
            else if (object.type === NODE_TYPE_SHELF && aliasedEverything) {
                object.type = NODE_TYPE_GROUP;
                object.parent_id = shelfNode.id;
            }

            object = await importJSONObjectImpl(object);

            if (oldObjectId && isContainer(object))
                idMap.set(oldObjectId, object.id);

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

    return shelfNode;
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
        let blob = await bookmarkManager.fetchBlob(node.id);
        if (blob) {
            let content = await bookmarkManager.reifyBlob(blob, true);

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
        let notes = await bookmarkManager.fetchNotes(node.id);
        if (notes) {
            delete notes.id;
            delete notes.node_id;
            node.notes = cleanObject(notes);
        }
    }

    if (node.has_comments)
        node.comments = await bookmarkManager.fetchComments(node.id);

    if (node.icon && node.stored_icon) {
        let icon = await bookmarkManager.fetchIcon(node.id);
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

