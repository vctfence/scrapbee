import {Query} from "./storage_query.js";
import {Path} from "./path.js";
import {EntityManager} from "./bookmarks.js";
import {NODE_TYPE_GROUP, NODE_TYPE_SHELF} from "./storage.js";
import {ishellBackend} from "./backend_ishell.js";
import {Node} from "./storage_entities.js";

class GroupManager extends EntityManager {

    async add(parent, name, nodeType = NODE_TYPE_GROUP) {
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
            type: NODE_TYPE_GROUP,
            parent_id: parentId,
            site: true
        }, parent);
    }

    async _addNode(node, parent) {
        node.name = await this.ensureUniqueName(parent?.id, node.name);
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

    // returns map of groups the function was able to find in the path
    async _queryGroups(pathList) {
        pathList = pathList.slice(0);

        let groups = {};
        let shelfName = pathList.shift();
        let shelf = await Query.shelf(shelfName);

        if (shelf)
            groups[shelf.name.toLocaleLowerCase()] = shelf;
        else
            return {};

        let parent = shelf;
        for (let name of pathList) {
            if (parent) {
                let group = await Query.subgroup(parent.id, name);
                groups[name.toLocaleLowerCase()] = group;
                parent = group;
            }
            else
                break;
        }

        return groups;
    }

    // returns the last group in the path if it exists
    async getByPath(path) {
        let pathList = Path.split(path);
        let groups = await this._queryGroups(pathList);

        return groups[pathList[pathList.length - 1].toLocaleLowerCase()];
    }

    // creates all non-existent groups in the path
    async getOrCreateByPath(path) {
        let pathList = Path.split(path);
        let groups = await this._queryGroups(pathList);
        let shelfName = pathList.shift();
        let parent = groups[shelfName.toLowerCase()];

        if (!parent) {
            parent = await Node.add({
                name: shelfName,
                type: NODE_TYPE_SHELF
            });
            ishellBackend.invalidateCompletion();
        }

        for (let name of pathList) {
            let group = groups[name.toLowerCase()];

            if (group) {
                parent = group;
            }
            else {
                let node = await Node.add({
                    parent_id: parent.id,
                    name: name,
                    type: NODE_TYPE_GROUP
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
        let group = await Node.get(id);

        if (group.name !== newName) {
            if (group.name.toLocaleUpperCase() !== newName.toLocaleUpperCase())
                group.name = await this.ensureUniqueName(group.parent_id, newName, group.name);
            else
                group.name = newName;

            try {
                await this.plugins.renameBookmark(group);
                ishellBackend.invalidateCompletion();
            }
            catch (e) {
                console.error(e);
            }

            await Node.update(group);
        }
        return group;
    }

}

export let Group = new GroupManager();
