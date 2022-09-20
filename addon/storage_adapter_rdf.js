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

    get concurrent() {
        return false;
    }

    accepts(node) {
        return node && node.external === RDF_EXTERNAL_TYPE;
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
        params.rdf_archive_path = await rdfShelf.getRDFArchiveDir(params.node);
        delete params.node;

        try {
            const response = await helperApp.postJSON(`/storage/fetch_rdf_archive_file`, params);

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
        // params.data_path = settings.data_folder_path();
        // params.content = new Blob([params.content]);
        // params.compute_index = true;
        //
        // try {
        //     const response = await helperApp.post(`/storage/save_archive_file`, params);
        //
        //     if (response.ok)
        //         return response.json()
        // } catch (e) {
        //     console.error(e);
        // }
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

    }

    async fetchComments(params) {

    }
}
