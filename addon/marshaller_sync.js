import {Marshaller, Unmarshaller} from "./marshaller.js";
import {Node} from "./storage_entities.js";
import {DEFAULT_SHELF_UUID} from "./storage.js";
import {SYNC_VERSION} from "./marshaller_json.js";

export class MarshallerSync extends Marshaller {
    constructor(backend, initial) {
        super();
        this._backend = backend;
        this._initial = initial;
    }

    async marshal(syncNode) {
        const node = await Node.getByUUID(syncNode.uuid);
        await this._resetExportedNodeDates(syncNode, node);

        let content;
        let exportedNode;

        if (syncNode.push_content) {
            content = await this.preprocessContent(node);
            exportedNode = content.node;
        }
        else
            exportedNode = this.preprocessNode(node);

        delete exportedNode.id;
        exportedNode.parent_id = syncNode.parent_id;

        const payload = {node: JSON.stringify(exportedNode)};

        if (!this.isContentEmpty(content))
            payload.content = this._serializeExportedContent(content);

        const resp = await this._backend.post("/sync/push_node", payload);

        if (!resp.ok)
            throw new Error(`Sync marshaling HTTP error: ${resp.status}`);
    }

    async _resetExportedNodeDates(syncNode, node) {
        if (this._initial) {
            // reset the date_modified to force import by other clients
            // of the nodes merged at the initial synchronization
            node.date_modified = new Date();
            if (node.content_modified || syncNode.content_modified)
                node.content_modified = node.date_modified;

            await Node.update(node, false);
        }

        if (node.uuid === DEFAULT_SHELF_UUID) {
            node.date_added = 0;
            node.date_modified = 0;
        }
    }

    _serializeExportedContent(content) {
        let result;

        const header = {sync: "Scrapyard", version: SYNC_VERSION};
        result = JSON.stringify(header);

        if (content.icon)
            result += "\n" + JSON.stringify({icon: content.icon});
        else
            result += "\n{}";

        delete content.node;
        delete content.icon;
        if (Object.keys(content).length)
            result += "\n" + JSON.stringify(content);

        return result;
    }
}

export class UnmarshallerSync extends Unmarshaller {
    constructor(backend) {
        super();
        this._backend = backend;
        this.setSyncMode();
    }

    async unmarshall(syncNode) {
        if (syncNode.uuid === DEFAULT_SHELF_UUID)
            return;

        const payload = await this._backend.jsonPost("/sync/pull_node", {node: JSON.stringify(syncNode)});

        if (!payload)
            throw new Error("Sync unmarshaling HTTP error")

        const node = payload.node;
        let content = this._deserializeContent(payload.content);
        content = Object.assign({node}, content);

        if (node.parent_id) {
            const parent = await Node.getByUUID(node.parent_id);
            if (parent)
                node.parent_id = parent.id;
            else
                throw new Error(`No parent for node: ${node.uuid}`);
        }

        await this.storeContent(content);
    }

    _deserializeContent(serializedContent) {
        const result = {};

        if (serializedContent) {
            let parts = serializedContent.split("\n").filter(s => !!s);

            if (parts.length) {
                //const header = JSON.parse(parts[0]);
                const icon = JSON.parse(parts[1]);
                const content = parts.length > 2? JSON.parse(parts[2]): {};

                Object.assign(result, icon);
                Object.assign(result, content);
            }
        }

        return result;
    }
}
