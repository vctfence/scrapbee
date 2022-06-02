import {EntityIDB} from "./storage_idb.js";
import {indexString} from "./utils_html.js";
import {Node} from "./storage_entities.js";

export class CommentsIDB extends EntityIDB {
    static newInstance() {
        const instance = new CommentsIDB();
        instance.import = new CommentsIDB();
        instance.import._importer = true;
        return instance;
    }

    async updateIndex(nodeId, words) {
        let exists = await this._db.index_comments.where("node_id").equals(nodeId).count();

        if (exists)
            return this._db.index_comments.where("node_id").equals(nodeId).modify({
                words: words
            });
        else
            return this._db.index_comments.add({
                node_id: nodeId,
                words: words
            });
    }

    async _addRaw(nodeId, comments) {
        const exists = await this._db.comments.where("node_id").equals(nodeId).count();

        if (!comments)
            comments = undefined;

        if (exists) {
            await this._db.comments.where("node_id").equals(nodeId).modify({
                comments: comments
            });
        }
        else {
            await this._db.comments.add({
                node_id: nodeId,
                comments: comments
            });
        }

        if (!this._importer) {
            const node = {id: nodeId, has_comments: !!comments};
            await Node.contentUpdate(node);
        }
    }

    async add(nodeId, comments) {
        await this._addRaw(nodeId, comments);

        if (comments) {
            let words = indexString(comments);
            await this.updateIndex(nodeId, words);
        }
        else
            await this.updateIndex(nodeId, []);
    }

    async get(nodeId) {
        let record = await this._db.comments.where("node_id").equals(nodeId).first();
        return record?.comments;
    }
}

