import {settings} from "./settings.js";
import {CLOUD_EXTERNAL_TYPE} from "./storage.js";

export class StorageAdapterCloud {
    accepts(node) {
        return node && node.external === CLOUD_EXTERNAL_TYPE;
    }

    async persistNode(params) {

    }

    async updateNode(params) {

    }

    async updateNodes(params) {

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

    async fetchArchive(params) {

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
