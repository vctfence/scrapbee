import {NODE_TYPE_ARCHIVE} from "./storage.js";
import {bookmarkManager} from "./backend.js";

export function parseJSONObject_v1(line) {
    let object;
    line = line.trim();
    try {
        if (line.endsWith(",")) // support for old JSON format files
            object = JSON.parse(line.slice(0, line.length - 1));
        else
            object = JSON.parse(line);
    } catch (e) {
        console.error(e)
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

export async function importJSONObject_v1(object) {
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

        node = await bookmarkManager.importBookmark(object);

        if (data)
            await bookmarkManager.storeIndexedBlob(node.id, data, object.mime_type, byte_length);
    }
    else {
        node = await bookmarkManager.importBookmark(object);
    }

    if (notes) {
        await bookmarkManager.storeIndexedNotes({
            node_id: node.id, content: notes, html: notes_html,
            format: notes_format, align: notes_align, width: notes_width
        });
    }

    if (comments) {
        await bookmarkManager.storeIndexedComments(node.id, comments);
    }

    if (icon_data)
        await bookmarkManager.storeIconLowLevel(node.id, icon_data);

    return node;
}
