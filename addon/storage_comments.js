import {EntityIDB} from "./storage_idb.js";
import {indexString} from "./utils_html.js";
import {Node} from "./storage_entities.js";
import {delegateProxy} from "./proxy.js";
import {CommentsProxy} from "./storage_comments_proxy.js";

export class CommentsIDB extends EntityIDB {
    static newInstance() {
        const instance = new CommentsIDB();

        instance.import = delegateProxy(new CommentsProxy(), new CommentsIDB());
        instance.import._importer = true;

        instance.idb = {import: new CommentsIDB()};
        instance.idb.import._importer = true;

        return delegateProxy(new CommentsProxy(), instance);
    }

    indexEntity(node, words) {
        return {
            node_id: node.id,
            words: words
        };
    }

    async storeIndex(node, words) {
        const exists = await this._db.index_comments.where("node_id").equals(node.id).count();
        const entity = this.indexEntity(node, words);

        if (exists)
            return this._db.index_comments.where("node_id").equals(node.id).modify(entity);
        else
            return this._db.index_comments.add(entity);
    }

    async _add(node, text) {
        const exists = await this._db.comments.where("node_id").equals(node.id).count();

        if (!text)
            text = undefined;

        if (exists) {
            await this._db.comments.where("node_id").equals(node.id).modify({
                comments: text
            });
        }
        else {
            await this._db.comments.add({
                node_id: node.id,
                comments: text
            });
        }
    }

    async add(node, comments) {
        await this._add(node, comments);

        if (!this._importer) {
            node.has_comments = !!comments;
            await Node.updateContentModified(node);
        }

        if (comments) {
            let words = indexString(comments);
            await this.storeIndex(node, words);
        }
        else
            await this.storeIndex(node, []);
    }

    async get(node) {
        let record = await this._db.comments.where("node_id").equals(node.id).first();
        return record?.comments;
    }
}

