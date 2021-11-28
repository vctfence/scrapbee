import {EntityManager} from "./bookmarks.js";
import {
    byDateDesc,
    byPosition,
    DEFAULT_SHELF_UUID,
    DONE_SHELF_NAME,
    EVERYTHING,
    isEndpoint, isNodeHasContents, isVirtualShelf,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP, NODE_TYPE_NOTES,
    NODE_TYPE_SEPARATOR,
    NODE_TYPE_SHELF, NON_IMPORTABLE_SHELVES,
    TODO_SHELF_NAME, DEFAULT_POSITION
} from "./storage.js";
import {indexWords} from "./utils_html.js";
import {Query} from "./storage_query.js";
import {Path} from "./path.js";
import {Group} from "./bookmarks_group.js";
import {ishellBackend} from "./backend_ishell.js";
import {cleanObject, computeSHA1, getMimetypeExt} from "./utils.js";
import {getFavicon} from "./favicon.js";
import {Archive, Comments, Icon, Node, Notes} from "./storage_entities.js";

export class BookmarkManager extends EntityManager {

    _splitTags(tags, separator = ",") {
        if (tags && typeof tags === "string")
            return tags.split(separator)
                .filter(t => !!t)
                .map(t => t.trim())
                .map(t => t.toLocaleUpperCase());

        return tags;
    }

    setTentativeId(node) {
        node.__tentative_id = "tentative_" + Math.floor(Math.random() * 1000);
        return node.__tentative_id;
    }

    async add(data, nodeType = NODE_TYPE_BOOKMARK) {
        let group, parentId;

        if (data.parent_id)
            parentId = data.parent_id = parseInt(data.parent_id);
        else
            throw new Error("No bookmark parent id");

        if (!group)
            group = await Node.get(parentId);

        data.name = await this.ensureUniqueName(data.parent_id, data.name);

        data.type = nodeType;
        data.tag_list = this._splitTags(data.tags);
        //await this.addTags(data.tag_list);

        const iconId = await this.storeIcon(data);

        if (iconId)
            data.content_modified = new Date();

        const node = await Node.add(data);

        if (iconId)
            await Icon.update(iconId, {node_id: node.id});

        await this.plugins.createBookmark(node, group);

        return node;
    }

    async addSeparator(parentId) {
        const options = {
            name: "-",
            type: NODE_TYPE_SEPARATOR,
            parent_id: parentId
        };

        let node = await Node.add(options);

        try {
            await this.plugins.createBookmark(node, await Node.get(parentId));
        }
        catch (e) {
            console.error(e);
        }

        return node;
    }

    async addNotes(parentId, name) {
        let node = await Node.add({
            parent_id: parentId,
            name: name,
            //has_notes: true,
            type: NODE_TYPE_NOTES
        });

        let group = await Node.get(parentId);

        try {
            await this.plugins.createBookmark(node, group);
        }
        catch (e) {
            console.error(e);
        }

        return node;
    }

    async import(data, sync) {
        if (data.uuid === DEFAULT_SHELF_UUID)
            return;

        if (data.type !== NODE_TYPE_SHELF)
            data.parent_id = data.parent_id || (await Group.getOrCreateByPath(data.path)).id;

        data = Object.assign({}, data);

        data.tag_list = this._splitTags(data.tags);
        //this.addTags(data.tag_list);

        const exists = await Node.exists(data);
        let forceNewUuid = data.uuid && (!sync && (exists || NON_IMPORTABLE_SHELVES.some(uuid => uuid === data.uuid)));

        const now = new Date();

        if (!data.date_added)
            data.date_added = now;

        // sync uses date_modified field to track changes, so this field should be updated on a regular import
        // but it should not be touched when performing a sync import
        if (!sync) {
            data.date_modified = now;
            if (data.content_modified || isNodeHasContents(data))
                data.content_modified = data.date_modified;
        }

        if (!data.uuid || forceNewUuid)
            Node.setUUID(data);

        let result;

        if (sync && exists) {
            const node = await Node.getByUUID(data.uuid);
            data.id = node.id;
            result = Node.update(data, false);
        }
        else
            result = Node.import(data);

        return result;
    }

    async update(data) {
        let update = {};
        Object.assign(update, data);

        //update.name = await this.ensureUniqueName(update.parent_id, update.name)

        update.tag_list = this._splitTags(update.tags);
        //this.addTags(update.tag_list);

        await this.plugins.updateBookmark(update);

        return Node.update(update);
    }

    clean(bookmark) {
        cleanObject(bookmark, true);

        if (!bookmark.name)
            bookmark.name = "";
    }

    async list(options //{search, // filter by node name or URL
                       // path,   // filter by hierarchical node group path (string), the first item in the path is a name of a shelf
                       // tags,   // filter for node tags (string, containing comma separated list)
                       // date,   // filter nodes by date
                       // date2,  // the second date in query
                       // period, // chronological period: "between", "before", "after"
                       // types,  // filter for node types (array of integers)
                       // limit,  // limit for the returned record number
                       // depth,  // specify depth of search: "group", "subtree" or "root+subtree"
                       // order   // order mode to sort the output if specified: "custom", "todo", "date_desc"
                       // content // search in content instead of node name (boolean)
                       // index   // index to use: "content", "comments", "notes"
                       //}
    ) {
        const path = options.path || EVERYTHING;
        let group = isVirtualShelf(path)? null: await Group.getByPath(path);

        if (!options.depth)
            options.depth = "subtree";

        if (options.tags)
            options.tags = this._splitTags(options.tags);

        let result;

        if (options.content && options.search) {
            const search = indexWords(options.search, false);

            let subtree;
            if (path) {
                subtree = [];

                if (path.toLowerCase() === EVERYTHING)
                    subtree = null;
                else if (path.toUpperCase() === TODO_SHELF_NAME)
                    subtree = (await Query.todo()).map(n => n.id);
                else if (path.toUpperCase() === DONE_SHELF_NAME)
                    subtree = (await Query.done()).map(n => n.id);
                else
                    await Query.selectAllChildrenIdsOf(group.id, subtree);
            }

            result = await Query.nodesByIndex(subtree, search, options.index);
        }
        else {
            result = await Query.nodes(group, options);
        }

        if (path?.toUpperCase() === TODO_SHELF_NAME || path?.toUpperCase() === DONE_SHELF_NAME) {
            for (let node of result) {
                node.__extended_todo = true;
                let pathList = await Path.compute(node);

                node.__path = [];
                for (let i = 0; i < pathList.length - 1; ++i) {
                    node.__path.push(pathList[i].name)
                }
            }
        }

        result.forEach(n => n.__filtering = true);

        if (options.order === "custom")
            result.sort(byPosition);
        else if (options.order === "date_desc")
            result.sort(byDateDesc);

        return result;
    }

    async reorder(positions) {
        try {
            await this.plugins.reorderBookmarks(positions);
        }
        catch (e) {
            console.error(e);
        }

        const id2pos = new Map(positions.map(n => [n.id, n.pos]));
        await Node.batchUpdate(n => n.pos = id2pos.get(n.id), Array.from(id2pos.keys()));
    }

    async move(ids, destId, moveLast) {
        const dest = await Node.get(destId);
        const nodes = await Node.get(ids);

        try {
            await this.plugins.moveBookmarks(dest, nodes);
        }
        catch (e) {
            console.error(e);
        }

        for (let n of nodes) {
            n.parent_id = destId;
            n.name = await this.ensureUniqueName(destId, n.name);

            if (moveLast)
                n.pos = DEFAULT_POSITION;

            await Node.update(n);
        }

        if (nodes.some(n => n.type === NODE_TYPE_GROUP))
            ishellBackend.invalidateCompletion();

        return Query.fullSubtree(ids, false, true);
    }

    async copy(ids, destId, moveLast) {
        const dest = await Node.get(destId);
        let all_nodes = await Query.fullSubtree(ids, true);
        let newNodes = [];

        for (let n of all_nodes) {
            let old_id = n.old_id = n.id;

            if (ids.some(id => id === old_id)) {
                n.parent_id = destId;
                n.name = await this.ensureUniqueName(destId, n.name);
            }
            else {
                let new_parent = newNodes.find(nn => nn.old_id === n.parent_id);
                if (new_parent)
                    n.parent_id = new_parent.id;
            }

            delete n.id;
            delete n.date_modified;

            if (moveLast && ids.some(id => id === n.old_id))
                n.pos = DEFAULT_POSITION;

            newNodes.push(Object.assign(n, await Node.add(n)));

            try {
                if (isEndpoint(n) && n.type !== NODE_TYPE_SEPARATOR) {
                    let notes = await Notes.get(old_id);
                    if (notes) {
                        delete notes.id;
                        notes.node_id = n.id;
                        await Notes.add(notes);
                        notes = null;
                    }

                    let comments = await Comments.get(old_id);
                    if (comments) {
                        await Comments.add(n.id, comments);
                        comments = null;
                    }

                    if (n.stored_icon) {
                        let icon = await Icon.get(old_id);
                        if (icon) {
                            await Icon.add(n.id, icon);
                        }
                    }
                }

                if (n.type === NODE_TYPE_ARCHIVE) {
                    let blob = await Archive.get(old_id);
                    if (blob) {
                        let index = await Archive.fetchIndex(old_id);
                        await Archive.add(n.id, blob.data || blob.object, blob.type, blob.byte_length, index);
                        blob = null;
                    }
                }
            } catch (e) {
                console.error(e);
            }
        }

        let rootNodes = newNodes.filter(n => ids.some(id => id === n.old_id));

        try {
            await this.plugins.copyBookmarks(dest, rootNodes);

            if (rootNodes.some(n => n.type === NODE_TYPE_GROUP))
                ishellBackend.invalidateCompletion();
        }
        catch (e) {
            console.error(e);
        }

        return newNodes;
    }

    async delete(ids) {
        if (!Array.isArray(ids))
            ids = [ids];

        let all_nodes = await Query.fullSubtree(ids);

        try {
            await this.plugins.deleteBookmarks(all_nodes);
        }
        catch (e) {
            console.error(e);
        }

        await Node.delete(all_nodes.map(n => n.id));

        if (all_nodes.some(n => n.type === NODE_TYPE_GROUP || n.type === NODE_TYPE_SHELF))
            ishellBackend.invalidateCompletion();
    }

    async deleteChildren(id) {
        let all_nodes = await Query.fullSubtree(id);

        await Node.delete(all_nodes.map(n => n.id).filter(i => i !== id));

        ishellBackend.invalidateCompletion();
    }

    async storeIcon(node, iconData, contentType) {
        const convertAndStore = async (iconData, contentType) => {
            if (iconData.byteLength && contentType && contentType.startsWith("image")) {
                const byteArray = new Uint8Array(iconData);

                let binaryString = "";
                for (let i = 0; i < byteArray.byteLength; i++)
                    binaryString += String.fromCharCode(byteArray[i]);

                contentType = contentType.split(";")[0];

                let iconUrl = `data:${contentType};base64,${btoa(binaryString)}`;

                const id = await Icon.add(node.id, iconUrl);

                return [id, iconUrl];
            }
        };

        const updateNode = async (node, iconUrl) => {
            node.stored_icon = true;
            node.icon = "hash:" + (await computeSHA1(iconUrl));
            if (node.id)
                await Node.update(node);
        };

        let iconId;

        if (node.icon) {
            try {
                if (node.icon.startsWith("data:")) {
                    iconId = await Icon.add(node.id, node.icon);
                    await updateNode(node, node.icon);
                }
                else {
                    if (iconData && contentType) {
                        const [id, iconUrl] = await convertAndStore(iconData, contentType);
                        await updateNode(node, iconUrl);
                        iconId = id;
                    }
                    else {
                        try {
                            const response = await fetch(node.icon);

                            if (response.ok) {
                                let type = response.headers.get("content-type");

                                if (!type) {
                                    let iconUrl = new URL(node.icon);
                                    type = getMimetypeExt(iconUrl.pathname);
                                }

                                if (type.startsWith("image")) {
                                    const buffer = await response.arrayBuffer();
                                    if (buffer.byteLength) {
                                        const [id, iconUrl] = await convertAndStore(buffer, type);
                                        await updateNode(node, iconUrl);
                                        iconId = id;
                                    }
                                }
                            }
                        }
                        catch (e) {
                            node.icon = undefined;
                            node.stored_icon = undefined;
                            if (node.id)
                                await Node.update(node);
                            console.error(e);
                        }
                    }
                }
            }
            catch (e) {
                console.error(e);
            }
        }

        return iconId;
    }

    async storeIconFromURI(node) {
        try {
            node.icon = await getFavicon(node.uri);
            await this.storeIcon(node);
        } catch (e) {
            console.error(e);
        }
    }

    async storeArchive(nodeId, data, contentType) {
        await Archive.add(nodeId, data, contentType);
        const node = await Node.get(nodeId);
        await this.plugins.storeBookmarkData(node, data, contentType);
    }

    async updateArchive(nodeId, data) {
        await Archive.updateHTML(nodeId, data);
        const node = await Node.get(nodeId);
        await this.plugins.updateBookmarkData(node, data);
    }

    async storeNotes(options, propertyChange) {
        await Notes.add(options, propertyChange);
        const node = await Node.get(options.node_id);
        await this.plugins.storeBookmarkNotes(node, options, propertyChange);
    }

    async storeComments(nodeId, comments) {
        await Comments.add(nodeId, comments);
        const node = await Node.get(nodeId);
        await this.plugins.storeBookmarkComments(node, comments);
    }
}

export let Bookmark = new BookmarkManager();


