import {helperApp} from "./helper_app.js";

export class StorageAdapterFiles {
    internalStorage = false;

    async _postJSON(path, fields) {
        try {
            return helperApp.postJSON(path, fields);
        }
        catch (e) {
            console.error(e);
        }
    }

    async _fetchJSON(path, fields) {
        try {
            const response = await helperApp.postJSON(path, fields);

            if (response.ok)
                return response.json();
        }
        catch (e) {
            console.error(e);
        }
    }

    #getNotesFormat(path) {
        path = path.toLowerCase();

        if (path.endsWith(".org"))
            return "org";
        else if (path.endsWith(".md"))
            return "markdown";
        else
            return "text";
    }

    accepts(node) {
        return node && node.external === RDF_EXTERNAL_TYPE;
    }

    async getParams(node) {
        return {
            path: node.external_id
        };
    }

    async persistNotes(params) {
        try {
            return helperApp.postJSON(`/files/save_file_content`, params);
        } catch (e) {
            console.error(e);
        }
    }

    async fetchNotes(params) {
        try {
            const response = await helperApp.postJSON(`/files/fetch_file_content`, params);

            if (response.ok) {
                const notes = {__file_as_notes: true};

                notes.content = await response.text();
                notes.format = this.#getNotesFormat(params.path);

                return notes;
            }
        } catch (e) {
            console.error(e);
        }
    }
}
