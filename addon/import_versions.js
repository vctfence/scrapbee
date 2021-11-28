import {NODE_TYPE_ARCHIVE} from "./storage.js";

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

    //object = transformFromV1ToV3(object);
    return transformFromV1ToV3(object);
}

// This function is also used to import ORG v2 objects which are essentially
// v1 objects with base64 binary blob representation
export function transformFromV1ToV3(object, blobVersion = 1) {
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

    const result = {
        node: object
    };

    if (object.type === NODE_TYPE_ARCHIVE) {
        let data = object.data;
        let byte_length = object.byte_length;

        delete object.data;
        delete object.byte_length;

        if (blobVersion === 1 && byte_length)
            data = btoa(data);

        result.archive = {object: data, type: object.mime_type, byte_length};
    }

    if (notes)
        result.notes = {content: notes, html: notes_html, format: notes_format, align: notes_align, width: notes_width};

    if (icon_data)
        result.icon = {data_url: icon_data};

    if (comments)
        result.comments = {text: comments};

    return result;
}

export function parseJSONObject_v2(line) {
    let object = JSON.parse(line);
    return transformFromV2ToV3(object);
}

export function transformFromV2ToV3(object) {
    const result = {
        node: object,
        notes: object.notes,
        archive: object.blob
    };

    if (object.icon_data)
        result.icon = {data_url: object.icon_data};

    if (object.comments)
        result.comments = {text: object.comments};

    delete object.blob;
    delete object.notes;
    delete object.comments;
    delete object.icon_data;

    return result;
}
