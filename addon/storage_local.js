import IDBStorage from "./storage_idb.js";
import {delegateProxy} from "./proxy.js";
import {indexWords} from "./utils_html.js";
import {notes2html} from "./notes_render.js";

export default class LocalStorage {
    constructor(type) {
        switch (type) {
            case IDBStorage.STORAGE_TYPE_ID:
                return delegateProxy(this, new IDBStorage());
        }
    }

    async storeIndexedBlob(nodeId, data, contentType, byteLength, index) {
        await this.storeBlobLowLevel(nodeId, data, contentType, byteLength);

        if (index?.words)
            await this.storeIndex(nodeId, index.words);
        else if (typeof data === "string" && !byteLength)
            await this.storeIndex(nodeId, indexWords(data));
    }

    async storeIndexedNotes(options) {
        await this.storeNotesLowLevel(options);

        if (options.content) {
            let words;

            if (options.format === "delta" && options.html)
                words = indexWords(options.html);
            else {
                if (options.format === "text")
                    words = indexWords(options.content, false);
                else {
                    let html = notes2html(options);
                    if (html)
                        words = indexWords(html);
                }
            }

            if (words)
                await this.updateNotesIndex(options.node_id, words);
            else
                await this.updateNotesIndex(options.node_id, []);
        }
        else
            await this.updateNotesIndex(options.node_id, []);
    }

    async storeIndexedComments(nodeId, comments) {
        await this.storeCommentsLowLevel(nodeId, comments);

        if (comments) {
            let words = indexWords(comments, false);
            await this.updateCommentIndex(nodeId, words);
        }
        else
            await this.updateCommentIndex(nodeId, []);
    }
}
