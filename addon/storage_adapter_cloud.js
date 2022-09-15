import {settings} from "./settings.js";
import {ARCHIVE_TYPE_BYTES, CLOUD_EXTERNAL_TYPE} from "./storage.js";
import {Archive} from "./storage_entities.js";

export class StorageAdapterCloud {
    _provider;

    setProvider(provider) {
        this._provider = provider;
    }

    get concurrent() {
        return false;
    }

    async withCloudDB(f, fe) {
        try {
            let db = await this._provider.downloadDB();
            await f(db);
            await this._provider.persistDB(db);
        }
        catch (e) {
            console.error(e);
            if (fe) fe(e);
        }
    }

    accepts(node) {
        return node && node.external === CLOUD_EXTERNAL_TYPE;
    }

    async persistNode(params) {
        return this.withCloudDB(db => db.addNode(params.node));
    }

    async updateNode(params) {
        return this.withCloudDB(db => db.updateNode(params.node));
    }

    async updateNodes(params) {
        return this.withCloudDB(db => {
            for (let node of params.nodes)
                db.updateNode(node);
        });
    }

    async deleteNodes(params) {
        await this.deleteNodesShallow(params);
        await this.deleteNodeContent(params);
    }

    async deleteNodesShallow(params) {
        return this.withCloudDB(db => {
            const nodes = params.node_uuids.map(uuid => ({uuid}));
            db.deleteNodes(nodes);
        });
    }

    async deleteNodeContent(params) {
        return this._provider.deleteAssets(params.node_uuids);
    }

    async persistIcon(params) {
        return this._provider.assets.storeIcon(params.uuid, params.icon_json);
    }

    async persistArchiveIndex(params) {
        return this._provider.assets.storeArchiveIndex(params.uuid, params.index_json);
    }

    async persistArchive(params) {
        await this._provider.assets.storeArchiveObject(params.uuid, params.archive_json);
        return this._provider.assets.storeArchiveContent(params.uuid, params.content);
    }

    async fetchArchive(params) {
        let object = await this._provider.assets.fetchArchiveObject(params.uuid);
        const content = await this._provider.assets.fetchArchiveContent(params.uuid);

        object = JSON.parse(object)

        if (object.type === ARCHIVE_TYPE_BYTES)
            object.content = content;
        else {
            const decoder = new TextDecoder();
            object.content = decoder.decode(content);
        }

        return object;
    }

    async persistNotesIndex(params) {
        return this._provider.assets.storeNotesIndex(params.uuid, params.index_json);
    }

    async persistNotes(params) {
        return this._provider.assets.storeNotes(params.uuid, params.notes_json);
    }

    async fetchNotes(params) {
        const json = await this._provider.assets.fetchNotes(params.uuid);
        if (json)
            return JSON.parse(json);
    }

    async persistCommentsIndex(params) {
        return this._provider.assets.storeCommentsIndex(params.uuid, params.index_json);
    }

    async persistComments(params) {
        return this._provider.assets.storeComments(params.uuid, params.comments_json);
    }

    async fetchComments(params) {
        const json = await this._provider.assets.fetchComments(params.uuid);
        if (json)
            return JSON.parse(json);
    }
}
