import {cleanObject} from "./utils.js";
import {BROWSER_EXTERNAL_NAME, NODE_TYPE_ARCHIVE} from "./storage.js";
import {Archive, Comments, Icon, Node, Notes} from "./storage_entities.js";
import {Bookmark} from "./bookmarks_bookmark.js";

export class Marshaller {
    _date2UnixTime(date) {
        if (date instanceof Date)
            date = date.getTime();
        else
            date = new Date(date).getTime();

        if (isNaN(date))
            date = 0;

        return date;
    }

    preprocessNode(node) {
        node = Node.sanitized(node);
        cleanObject(node);
        Node.strip(node);

        if (!node.name)
            node.name = "";

        for (let key of Object.keys(node))
            if (key.endsWith("_added") || key.endsWith("_modified"))
                node[key] = this._date2UnixTime(node[key]);

        if (node.external === BROWSER_EXTERNAL_NAME) {
            delete node.external;
            delete node.external_id;
        }

        return node;
    }

    async preprocessContent(node) {
        const result = {node: this.preprocessNode(node)};

        if (node.type === NODE_TYPE_ARCHIVE) {
            let archive = await Archive.get(node.id);
            if (archive)
                result.archive = await this.preprocessArchive(archive);
        }

        if (node.has_notes) {
            let notes = await Notes.get(node.id);
            if (notes)
                result.notes = this.preprocessNotes(notes);
        }

        if (node.has_comments)
            result.comments = this.preprocessComments(await Comments.get(node.id));

        if (node.icon && node.stored_icon)
            result.icon = this.preprocessIcon(await Icon.get(node.id));

        return result;
    }

    async preprocessArchive(archive) {
        let content = await Archive.reify(archive, true);

        delete archive.id;
        delete archive.data;
        delete archive.node_id;

        if (archive.byte_length)
            content = btoa(content);

        archive.object = content;
        return cleanObject(archive);
    }

    preprocessNotes(notes) {
        delete notes.id;
        delete notes.node_id;
        return cleanObject(notes);
    }

    preprocessComments(comments) {
        if (comments)
            return {text: comments};
    }

    preprocessIcon(icon) {
        if (icon)
            return {data_url: icon};
    }

    isContentEmpty(content) {
        return !content || (content && !(content.icon || content.archive || content.notes || content.comments));
    }
}

export class Unmarshaller {
    setSyncMode() {
        this._sync = true;
    }

    setForceLoadIcons() {
        this._forceIcons = true;
    }

    async storeContent(content) {
        let {node, icon, archive, notes, comments} = content;

        delete node.id;

        if (!node.name)
            node.name = "";

        for (let key of Object.keys(node))
            if (key.endsWith("_added") || key.endsWith("_modified"))
                node[key] = new Date(node[key]);

        node = await Bookmark.import(node, this._sync);

        if (this._forceIcons)
            await Bookmark.storeIconFromURI(node);

        if (node.type === NODE_TYPE_ARCHIVE && archive) {
            if (archive.byte_length)
                archive.object = atob(archive.object);
            await Archive.import.add(node.id, archive.object, archive.type, archive.byte_length);
        }

        if (notes) {
            notes.node_id = node.id;
            await Notes.import.add(notes);
        }

        if (comments)
            await Comments.import.add(node.id, comments.text);

        if (icon)
            await Icon.import.add(node.id, icon.data_url);
        else {
            if (node.icon && !node.stored_icon) // may appear from android application
                await Bookmark.storeIcon(node);
        }

        return node;
    }
}
