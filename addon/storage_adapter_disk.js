import {helperApp} from "./helper_app.js";
import {settings} from "./settings.js";
import {NON_SYNCHRONIZED_EXTERNALS} from "./storage.js";

export class StorageAdapterDisk {
    async _postJSON(path, fields) {
        try {
            fields.data_path = settings.data_folder_path()
            return helperApp.postJSON(path, fields);
        }
        catch (e) {
            console.error(e);
        }
    }

    async _fetchJSON(path, fields) {
        try {
            fields.data_path = settings.data_folder_path()
            const response = await helperApp.postJSON(path, fields);

            if (response.ok)
                return response.json();
        }
        catch (e) {
            console.error(e);
        }
    }

    get concurrent() {
        return true;
    }

    accepts(node) {
        return node && !(
            (node.external || node.__dest_external)
                && NON_SYNCHRONIZED_EXTERNALS.some(ex => ex === node.external || ex === node.__dest_external)
        )
    }

    async persistNode(params) {
        return this._postJSON("/storage/persist_node", params);
    }

    async updateNode(params) {
        return this._postJSON("/storage/update_node", params);
    }

    async updateNodes(params) {
        return this._postJSON("/storage/update_nodes", params);
    }

    async deleteNodes(params) {
        return this._postJSON("/storage/delete_nodes", params);
    }

    async deleteNodesShallow(params) {
        return this._postJSON("/storage/delete_nodes_shallow", params);
    }

    async deleteNodeContent(params) {
        return this._postJSON("/storage/delete_node_content", params);
    }

    async persistIcon(params) {
        return this._postJSON("/storage/persist_icon", params);
    }

    async persistArchiveIndex(params) {
        return this._postJSON("/storage/persist_archive_index", params);
    }

    async persistArchive(params) {
        params.archive_json = JSON.stringify(params.archive);
        delete params.archive;
        delete params.entity;

        return this._postJSON("/storage/persist_archive", params);
    }

    async fetchArchive(params) {
        return this._fetchJSON("/storage/fetch_archive", params);
    }

    async persistNotesIndex(params) {
        return this._postJSON("/storage/persist_notes_index", params);
    }

    async persistNotes(params) {
        return this._postJSON("/storage/persist_notes", params);
    }

    async fetchNotes(params) {
        return this._fetchJSON("/storage/fetch_notes", params);
    }

    async persistCommentsIndex(params) {
        return this._postJSON("/storage/persist_comments_index", params);
    }

    async persistComments(params) {
        return this._postJSON("/storage/persist_comments", params);
    }

    async fetchComments(params) {
        return this._fetchJSON("/storage/fetch_comments", params);
    }
}
