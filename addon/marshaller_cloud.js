import {NODE_TYPE_ARCHIVE} from "./storage.js";
import {Marshaller, Unmarshaller} from "./marshaller.js";
import {Node} from "./storage_entities.js";
import {notes2html} from "./notes_render.js";

export class MarshallerCloud extends Marshaller {
    async marshalContent(db, node, parent) {
        const {node: exportedNode, icon, archive, notes, comments} = await this.preprocessContent(node);
        exportedNode.parent_id = parent.uuid;
        delete exportedNode.id;

        const nodeObject = {node: exportedNode};
        if (icon)
            nodeObject.icon = icon;

        db.addNode(nodeObject);

        if (archive)
            await db.storeData(node, JSON.stringify(archive));

        if (notes)
            await this._marshalNotes(db, node, notes);

        if (comments)
            await db.storeComments(node, JSON.stringify(comments));
    }

    async marshalNodeUpdate(db, node) {
        const parent = await Node.get(node.parent_id);
        const exportedNode = this.preprocessNode(node);
        exportedNode.parent_id = parent.uuid;
        delete exportedNode.id;
        db.updateNode(exportedNode);
    }

    async marshalArchive(db, node, archive) {
        archive = await this.preprocessArchive(archive);
        await this.marshalNodeUpdate(db, node);
        await db.storeData(node, JSON.stringify(archive));
    }

    async marshalNotes(db, node, notes) {
        notes = this.preprocessNotes(notes);
        await this.marshalNodeUpdate(db, node);
        await this._marshalNotes(db, node, notes);
    }

    async _marshalNotes(db, node, notes) {
        await db.storeNotes(node, JSON.stringify(notes));

        if (notes.content) {
            let isHtml = notes.format === "html" || notes.format === "delta";
            let view = `<html><head></head><body class="${isHtml? "format-html": ""}">${notes2html(notes)}</body></html>`;
            await db.storeView(node, view);
        }
    }

    async marshalComments(db, node, comments) {
        comments = this.preprocessComments(comments);
        await this.marshalNodeUpdate(db, node);
        await db.storeComments(node, JSON.stringify(comments));
    }
}

export class UnmarshallerCloud extends Unmarshaller {
    constructor() {
        super();
        this.setSyncMode();
    }

    async unmarshal(db, object) {
        const {node: importedNode, icon} = object;
        const node = await Node.getByUUID(importedNode.uuid);

        if (node) {
            if (importedNode.date_modified > node.date_modified) {
                await this._findParent(importedNode);
                const content = {node: importedNode, icon};
                if (importedNode.content_modified > node.date_modified)
                    Object.assign(content, await this._unmarshalContent(db, importedNode))
                await this.storeContent(content);
            }
        }
        else {
            await this._findParent(importedNode);
            const content = Object.assign({node: importedNode, icon}, await this._unmarshalContent(db, importedNode));
            await this.storeContent(content);
        }
    }

    async _findParent(node) {
        const parent = await Node.getByUUID(node.parent_id);
        if (parent)
            node.parent_id = parent.id;
        else
            throw new Error(`No parent for node: ${node.uuid}`)
    }

    async _unmarshalContent(db, node) {
        const content = {};

        if (node.type === NODE_TYPE_ARCHIVE) {
            const archive = await db.fetchData(node);
            if (archive)
                content.archive = JSON.parse(archive);
        }

        if (node.has_notes) {
            const notes = await db.fetchNotes(node);
            if (notes)
                content.notes = JSON.parse(notes);
        }

        if (node.has_comments) {
            const comments = await db.fetchComments(node);
            if (comments)
                content.comments = JSON.parse(comments);
        }

        return content;
    }
}
