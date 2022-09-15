import {cleanObject} from "./utils.js";
import {NODE_TYPE_ARCHIVE} from "./storage.js";
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

    serializeNode(node) {
        node = Node.sanitized(node);
        cleanObject(node);
        Node.strip(node);

        if (!node.name)
            node.name = "";

        for (let key of Object.keys(node))
            if (key.endsWith("_added") || key.endsWith("_modified"))
                node[key] = this._date2UnixTime(node[key]);

        return node;
    }

    async serializeContent(node) {
        const result = {node: this.serializeNode(node)};

        if (node.type === NODE_TYPE_ARCHIVE) {
            let archive = await Archive.get(node);
            if (archive)
                result.archive = await this.serializeArchive(archive);
        }

        if (node.has_notes) {
            let notes = await Notes.get(node);
            if (notes)
                result.notes = this.serializeNotes(notes);
        }

        if (node.has_comments)
            result.comments = this.serializeComments(await Comments.get(node));

        if (node.icon && node.stored_icon)
            result.icon = this.serializeIcon(await Icon.get(node));

        return result;
    }

    async serializeArchive(archive) {
        let content = await Archive.reify(archive, true);

        delete archive.id;
        delete archive.node_id;

        if (archive.byte_length)
            content = btoa(content);

        archive.object = content;
        return cleanObject(archive);
    }

    serializeNotes(notes) {
        delete notes.id;
        delete notes.node_id;
        return cleanObject(notes);
    }

    serializeComments(comments) {
        if (comments)
            return {text: comments};
    }

    serializeIcon(icon) {
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

    setIDBOnlyMode() {
        this._idbOnly = true;
    }

    setForceLoadIcons() {
        this._forceIcons = true;
    }

    deserializeNode(node) {
        delete node.id;

        if (!node.name)
            node.name = "";

        for (let key of Object.keys(node))
            if (key.endsWith("_added") || key.endsWith("_modified"))
                node[key] = new Date(node[key]);

        return node;
    }

    deserializeArchive(archive) {
        if (archive.byte_length && archive.object) {
            archive.object = atob(archive.object);
            archive.byte_length = archive.object.length;
        }

        return archive;
    }

    async storeContent(content) {
        let {node, icon, archive, notes, comments} = content;
        let _Bookmark = Bookmark;
        let _Icon = Icon;

        if (this._idbOnly) {
            _Bookmark = Bookmark.idb;
            _Icon = Icon.idb;
        }

        node = this.deserializeNode(node);
        node = await _Bookmark.import(node, this._sync);

        if (this._forceIcons)
            await _Bookmark.storeIconFromURI(node);

        if (node.type === NODE_TYPE_ARCHIVE && archive) {
            archive = this.deserializeArchive(archive);
            await Archive.import.add(node, archive.object, archive.type, archive.byte_length);
        }

        if (notes) {
            notes.node_id = node.id;
            await Notes.import.add(node, notes);
        }

        if (comments)
            await Comments.import.add(node, comments.text);

        if (icon)
            await _Icon.import.add(node, icon.data_url);
        else {
            if (node.icon && !node.stored_icon) // may appear from android application
                await _Bookmark.storeIcon(node);
        }

        return node;
    }
}
