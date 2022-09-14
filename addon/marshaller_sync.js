import {Archive, Comments, Icon, Node, Notes} from "./storage_entities.js";
import {DEFAULT_SHELF_UUID} from "./storage.js";
import {UnmarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";
import {helperApp} from "./helper_app.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {settings} from "./settings.js";


// export class MarshallerSync extends MarshallerJSONScrapbook {
//     constructor(backend, initial) {
//         super();
//         this._backend = backend;
//         this._initial = initial;
//     }
//
//     async marshal(syncNode) {
//         const node = await Node.getByUUID(syncNode.uuid);
//         await this._resetExportedNodeDates(syncNode, node);
//
//         let content;
//         let exportedNode;
//
//         if (syncNode.push_content) {
//             content = await this.preprocessContent(node);
//             exportedNode = content.node;
//         }
//         else
//             exportedNode = this.preprocessNode(node);
//
//         delete exportedNode.id;
//         exportedNode.parent_id = syncNode.parent_id;
//
//         const payload = {node: JSON.stringify(exportedNode)};
//
//         if (!this.isContentEmpty(content))
//             payload.content = this._serializeExportedContent(content);
//
//         const resp = await this._backend.post("/sync/push_node", payload);
//
//         if (!resp.ok)
//             throw new Error(`Sync marshaling HTTP error: ${resp.status}`);
//     }
//
//     async _resetExportedNodeDates(syncNode, node) {
//         if (this._initial) {
//             // reset the date_modified to force import by other clients
//             // of the nodes merged at the initial synchronization
//             node.date_modified = new Date();
//             if (node.content_modified || syncNode.content_modified)
//                 node.content_modified = node.date_modified;
//
//             await Node.update(node, false);
//         }
//
//         if (node.uuid === DEFAULT_SHELF_UUID) {
//             node.date_added = 0;
//             node.date_modified = 0;
//         }
//     }
//
//     _serializeExportedContent(content) {
//         let result;
//
//         const header = {sync: "Scrapyard", version: <!!!!!>};
//         result = JSON.stringify(header);
//
//         if (content.icon)
//             result += "\n" + JSON.stringify({icon: content.icon});
//         else
//             result += "\n{}";
//
//         delete content.node;
//         delete content.icon;
//         if (Object.keys(content).length)
//             result += "\n" + JSON.stringify(content);
//
//         return result;
//     }
// }

export class UnmarshallerSync extends UnmarshallerJSONScrapbook {
    constructor() {
        super();
        this.setSyncMode();
    }

    async unmarshall(syncNode) {
        if (syncNode.uuid === DEFAULT_SHELF_UUID)
            return;

        const payload = await helperApp.fetchJSON_postJSON("/storage/sync_pull_objects", {
            data_path: settings.data_folder_path(),
            sync_node: JSON.stringify(syncNode)
        });

        let {node, icon, archive_index, notes_index, comments_index} = payload;

        node = await this.deserializeNode(node);
        node = this.preprocessNode(node);

        await this._findParentInIDB(node);

        if (icon) {
            icon = this.deserializeIcon(icon);
            node.icon = await Icon.computeHash(icon.data_url);
        }

        node = await Bookmark.idb.import(node, this._sync);

        if (icon)
            await Icon.idb.import.add(node, icon.data_url);

        if (archive_index) {
            archive_index = this.deserializeIndex(archive_index);
            Archive.idb.import.storeIndex(node, archive_index.words);
        }

        if (notes_index) {
            notes_index = this.deserializeIndex(notes_index);
            Notes.idb.import.storeIndex(node, notes_index.words);
        }

        if (comments_index) {
            comments_index = this.deserializeIndex(comments_index);
            Comments.idb.import.storeIndex(node, comments_index.words);
        }
    }
}
