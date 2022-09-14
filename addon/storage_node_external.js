import {EntityIDB} from "./storage_idb.js";
import {Node} from "./storage_entities.js";

export class ExternalNodeIDB extends EntityIDB {
    _Node = Node;

    static newInstance() {
        const instance = new ExternalNodeIDB();

        instance.idb = new ExternalNodeIDB();
        instance.idb._Node = Node.idb;

        return instance;
    }

    get(...args) {
        let externalId, kind;

        if (args.length === 2) {
            externalId = args[0];
            kind = args[1];
        }
        else
            kind = args[0];

        if (externalId)
            return this._db.nodes.where("external_id").equals(externalId).and(n => n.external === kind).first();
        else
            return this._db.nodes.where("external").equals(kind).toArray();
    }

    async exists(externalId, kind) {
        return !!(await this._db.nodes.where("external_id").equals(externalId).and(n => n.external === kind).count());
    }

    async delete(kind) {
        const nodes = await this._db.nodes.where("external").equals(kind).toArray();
        return this._Node.delete(nodes);
    }

    async deleteMissingIn(retainExternalIDs, kind) {
        const retain = new Set(retainExternalIDs);

        const nodes = await this._db.nodes.where("external").equals(kind)
            .and(n => n.external_id && !retain.has(n.external_id))
            .toArray();

        return this._Node.delete(nodes);
    }
}

export let ExternalNode = ExternalNodeIDB.newInstance();
