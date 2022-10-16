import {NODE_TYPE_ARCHIVE} from "./storage.js";
import {Archive, Comments, Icon, Node, Notes} from "./storage_entities.js";
import {UnmarshallerJSONScrapbook} from "./marshaller_json_scrapbook.js";

export class UnmarshallerCloud extends UnmarshallerJSONScrapbook {
    constructor() {
        super();
        this.setSyncMode();
        this.setIDBOnlyMode();
    }

    async unmarshal(provider, cloudNode) {
        cloudNode = this.unconvertNode(cloudNode);
        await this.findParentInIDB(cloudNode);

        const content = {node: cloudNode};
        let node = await Node.getByUUID(cloudNode.uuid);

        if (node) {
            if (cloudNode.date_modified > node.date_modified) {
                if (cloudNode.content_modified > node.date_modified)
                    Object.assign(content, await this._unmarshalContent(provider, cloudNode));

                node = await this.storeContent(content);
                await this._storeIndexes(provider, node);
            }
        }
        else {
            Object.assign(content, await this._unmarshalContent(provider, cloudNode));
            const node = await this.storeContent(content);
            await this._storeIndexes(provider, node);
        }
    }

    async _unmarshalContent(provider, node) {
        const content = {};

        if (node.stored_icon) {
            let icon = await provider.assets.fetchIcon(node.uuid);
            if (icon) {
                icon = JSON.parse(icon);
                icon = this.unconvertIcon(icon);
                node.icon = await Icon.computeHash(icon.data_url);
                content.icon = icon;
            }
        }

        if (node.has_comments) {
            let comments = await provider.assets.fetchComments(node.uuid);
            if (comments) {
                comments = JSON.parse(comments);
                content.comments = this.unconvertComments(comments);
            }
        }

        return content;
    }

    async _storeIndexes(provider, node) {
        if (node.type === NODE_TYPE_ARCHIVE) {
            let archiveIndex = await provider.assets.fetchArchiveIndex(node.uuid);
            if (archiveIndex) {
                archiveIndex = JSON.parse(archiveIndex);
                archiveIndex = this.unconvertIndex(archiveIndex);
                Archive.idb.import.storeIndex(node, archiveIndex.words);
            }
        }

        if (node.has_notes) {
            let notesIndex = await provider.assets.fetchNotesIndex(node.uuid);
            if (notesIndex) {
                notesIndex = JSON.parse(notesIndex);
                notesIndex = this.unconvertIndex(notesIndex);
                Notes.idb.import.storeIndex(node, notesIndex.words);
            }
        }

        if (node.has_comments) {
            let commentsIndex = await provider.assets.fetchCommentsIndex(node.uuid);
            if (commentsIndex) {
                commentsIndex = JSON.parse(commentsIndex);
                commentsIndex = this.unconvertIndex(commentsIndex);
                Comments.idb.import.storeIndex(node, commentsIndex.words);
            }
        }
    }
}
