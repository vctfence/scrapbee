import {Query} from "./storage_query.js";
import {Path} from "./path.js";
import {EntityManager} from "./bookmarks.js";
import {NODE_TYPE_FOLDER, NODE_TYPE_SHELF} from "./storage.js";
import {ishellBackend} from "./backend_ishell.js";
import {Node} from "./storage_entities.js";

class FolderManager extends EntityManager {

    async add(parent, name, nodeType = NODE_TYPE_FOLDER) {
        if (parent && typeof parent === "number")
            parent = await Node.get(parent);

        return this._addNode({
            name,
            type: nodeType,
            parent_id: parent?.id
        }, parent);
    }

    async addSite(parentId, name) {
        const parent = await Node.get(parentId);

        return this._addNode({
            name,
            type: NODE_TYPE_FOLDER,
            parent_id: parentId,
            site: true
        }, parent);
    }

    async _addNode(node, parent) {
        node.name = await this.ensureUniqueName(parent?.id, node.name);
        node.external = parent.external;
        node = await Node.add(node);

        try {
            ishellBackend.invalidateCompletion();

            if (parent)
                await this.plugins.createBookmarkFolder(node, parent);
        }
        catch (e) {
            console.error(e);
        }

        return node;
    }

    // returns map of folders the function was able to find in the path
    async _queryFolders(pathList) {
        pathList = pathList.slice(0);

        let folders = {};
        let shelfName = pathList.shift();
        let shelf = await Query.shelf(shelfName);

        if (shelf)
            folders[shelf.name.toLocaleLowerCase()] = shelf;
        else
            return {};

        let parent = shelf;
        for (let name of pathList) {
            if (parent) {
                let folder = await Query.subfolder(parent.id, name);
                folders[name.toLocaleLowerCase()] = folder;
                parent = folder;
            }
            else
                break;
        }

        return folders;
    }

    // returns the last folder in the path if it exists
    async getByPath(path) {
        let pathList = Path.split(path);
        let folders = await this._queryFolders(pathList);

        return folders[pathList[pathList.length - 1].toLocaleLowerCase()];
    }

    // creates all non-existent folders in the path
    async getOrCreateByPath(path) {
        let pathList = Path.split(path);
        let folders = await this._queryFolders(pathList);
        let shelfName = pathList.shift();
        let parent = folders[shelfName.toLowerCase()];

        if (!parent) {
            parent = await Node.add({
                name: shelfName,
                type: NODE_TYPE_SHELF
            });
            ishellBackend.invalidateCompletion();
        }

        for (let name of pathList) {
            let folder = folders[name.toLowerCase()];

            if (folder) {
                parent = folder;
            }
            else {
                let node = await Node.add({
                    parent_id: parent.id,
                    external: parent.external,
                    name: name,
                    type: NODE_TYPE_FOLDER
                });

                try {
                    await this.plugins.createBookmarkFolder(node, parent);
                    ishellBackend.invalidateCompletion();
                }
                catch (e) {
                    console.error(e);
                }

                parent = node;
            }
        }

        return parent;
    }

    async rename(id, newName) {
        let folder = await Node.get(id);

        if (folder.name !== newName) {
            if (folder.name.toLocaleUpperCase() !== newName.toLocaleUpperCase())
                folder.name = await this.ensureUniqueName(folder.parent_id, newName, folder.name);
            else
                folder.name = newName;

            try {
                await this.plugins.renameBookmark(folder);
                ishellBackend.invalidateCompletion();
            }
            catch (e) {
                console.error(e);
            }

            await Node.update(folder);
        }
        return folder;
    }

}

export let Folder = new FolderManager();
