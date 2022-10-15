import {helperApp} from "./helper_app.js";
import {settings} from "./settings.js";
import {rdfShelf} from "./plugin_rdf_shelf.js";

export class StorageAdapterRDF {
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

    accepts(node) {
        return node && node.external === RDF_EXTERNAL_TYPE;
    }

    async getParams(node) {
        return {
            rdf_archive_path: await rdfShelf.getRDFArchiveDir(node)
        };
    }

    async persistNode(params) {

    }

    async updateNode(params) {

    }

    async updateNodes(params) {

    }

    async deleteNodes(params) {

    }

    async deleteNodesShallow(params) {

    }

    async deleteNodeContent(params) {

    }

    async persistIcon(params) {

    }

    async persistArchiveIndex(params) {

    }

    async persistArchive(params) {

    }

    async fetchArchiveContent(params) {

    }

    async fetchArchiveFile(params) {
        try {
            const response = await helperApp.postJSON(`/rdf/fetch_archive_file`, params);

            if (response.ok) {
                let content = await response.arrayBuffer();
                const decoder = new TextDecoder();
                return decoder.decode(content);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async saveArchiveFile(params) {
        params.content = new Blob([params.content]);

        try {
            const response = await helperApp.post(`/rdf/save_archive_file`, params);

            if (response.ok)
                return response.json()
        } catch (e) {
            console.error(e);
        }
    }

    async persistNotesIndex(params) {

    }

    async persistNotes(params) {

    }

    async fetchNotes(params) {

    }

    async persistCommentsIndex(params) {

    }

    async persistComments(params) {
        return this._postJSON("/rdf/persist_comments", params);
    }

    async fetchComments(params) {

    }
}
