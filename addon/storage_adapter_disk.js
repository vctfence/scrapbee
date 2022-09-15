import {helperApp} from "./helper_app.js";
import {settings} from "./settings.js";
import {ARCHIVE_TYPE_TEXT, NON_SYNCHRONIZED_EXTERNALS} from "./storage.js";

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
            node.external && NON_SYNCHRONIZED_EXTERNALS.some(ex => ex === node.external)
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
        const content = params.content;

        delete params.content;
        await this._postJSON("/storage/persist_archive_object", params);

        const fields = {
            data_path: settings.data_folder_path(),
            content: new Blob([content]),
            uuid: params.uuid
        };

        try {
            return helperApp.post(`/storage/persist_archive_content`, fields);
        } catch (e) {
            console.error(e);
        }
    }

    async fetchArchive(params) {
        const archive = await this._fetchJSON("/storage/fetch_archive_object", params);

        if (archive) {
            params.data_path = settings.data_folder_path();

            try {
                const response = await helperApp.post(`/storage/fetch_archive_content`, params);

                if (response.ok) {
                    archive.content = await response.arrayBuffer();

                    if (archive.type === ARCHIVE_TYPE_TEXT) {
                        const decoder = new TextDecoder();
                        archive.content = decoder.decode(archive.content);
                    }

                    return archive;
                }

            } catch (e) {
                console.error(e);
            }
        }
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
