import {
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    NODE_TYPE_SEPARATOR,
    DEFAULT_SHELF_NAME,
    TODO_NAME,
    DONE_NAME
} from "./db.js"

import Storage from "./db.js"

class IDBBackend extends Storage {

    constructor() {
        super();
    }

    _normalizePath(path) {
        if (path) {
            path = path.trim();
            if (path.startsWith("/"))
                path = DEFAULT_SHELF_NAME + path;
            else if (!path)
                path = DEFAULT_SHELF_NAME;

            return path;
        }
        else
            return DEFAULT_SHELF_NAME;
    }

    _splitPath(path) {
        return this._normalizePath(path).split("/").filter(n => !!n);
    }

    _splitTags(tags, separator = ",") {
        if (tags && typeof tags === "string")
            return tags.split(separator)
                .filter(t => !!t)
                .map(t => t.trim())
                .map(t => t.toLocaleUpperCase());

        return tags;
    }

    listShelves() {
        return this.queryShelf();
    }

    async listNodes(options //{search, // filter by node name or URL
                      // path,   // filter by hierarchical node group path (string), the first item in the path is a name of a shelf
                      // tags,   // filter for node tags (string, containing comma separated list)
                      // types,  // filter for node types (array of integers)
                      // limit,  // limit for the returned record number
                      // depth,  // specify depth of search: "group", "subtree" or "root+subtree"
                      // order   // order mode to sort the output if specified: "custom", "todo"
                      // content // search in content instead of node name (boolean)
                      //}
              ) {
        let group = options.path && options.path !== TODO_NAME && options.path !== DONE_NAME
            ? await this._queryGroup(options.path)
            : null;

        if (!options.depth)
            options.depth = "subtree";

        if (options.tags)
            options.tags = this._splitTags(options.tags);

        let result;

        if (options.content && options.search) {
            let search = this._splitTags(options.search, /\s+/);
            delete options.search;
            result = await this.queryNodes(group, options);
            result = await this.filterByContent(result, search);
        }
        else
            result = await this.queryNodes(group, options);

        if (options.path && (options.path === TODO_NAME || options.path === DONE_NAME)) {
            for (let node of result) {
                node._extended_todo = true;
                let path = await this.computePath(node.id);

                node._path = [];
                for (let i = 0; i < path.length - 1; ++i) {
                    node._path.push(path[i].name)
                }
            }
        }

        return result;
    }

    reorderNodes(positions) {
        return this.updateNodes(positions);
    }

    setTODOState(states) {
        return this.updateNodes(states);
    }

    async listTODO() {
        let todo = await this.queryTODO();

        let now = new Date();
        now.setUTCHours(0, 0, 0, 0);

        for (let node of todo) {
            let todo_date;

            if (node.todo_date && node.todo_date != "")
            try {
                todo_date = new Date(node.todo_date);
                todo_date.setUTCHours(0, 0, 0, 0);
            } catch (e) {
            }

            if (todo_date && now >= todo_date)
                node._overdue = true;

            let path = await this.computePath(node.id);

            node._path = [];
            for (let i = 0; i < path.length - 1; ++i) {
                node._path.push(path[i].name)
            }

            node._extended_todo = true;
        }

        return todo.filter(n => n._overdue).concat(todo.filter(n => !n._overdue));
    }

    async listDONE() {
        let done = await this.queryDONE();

        for (let node of done) {
            let path = await this.computePath(node.id);

            node._path = [];
            for (let i = 0; i < path.length - 1; ++i) {
                node._path.push(path[i].name)
            }

            node._extended_todo = true;
        }

        return done;
    }

    // returns map of groups the function was able to find in the path
    async _queryGroups(path_list) {
        path_list = path_list.slice(0);

        let groups = {};
        let shelf_name = path_list.shift();
        let shelf = await this.queryShelf(shelf_name);

        if (shelf)
            groups[shelf.name.toLowerCase()] = shelf;
        else
            return {};

        let parent = shelf;
        for (let name of path_list) {
            if (parent) {
                let group = await this.queryGroup(parent.id, name);
                groups[name.toLowerCase()] = group;
                parent = group;
            }
            else
                break;
        }

        return groups;
    }

    // returns the last group in path if it exists
    async _queryGroup(path) {
        let path_list = this._splitPath(path);
        let groups = await this._queryGroups(path_list);

        return groups[path_list[path_list.length - 1].toLowerCase()];
    }

    // creates all non-existent groups
    async _getGroup(path) {
        let path_list = this._splitPath(path);
        let groups = await this._queryGroups(path_list);
        let shelf_name = path_list.shift();
        let parent = groups[shelf_name.toLowerCase()];


        if (!parent) {
            parent = await this.addNode({
                name: shelf_name,
                type: NODE_TYPE_SHELF
            });
        }

        for (let name of path_list) {
            let group = groups[name.toLowerCase()];

            if (group) {
                parent = group;
            }
            else
                parent = await this.addNode({
                    parent_id: parent.id,
                    name: name,
                    type: NODE_TYPE_GROUP
                });
        }

        return parent;
    }

    async _ensureUnique(parent_id, name) {
        let children;

        if (parent_id)
            children = (await this.getChildNodes(parent_id)).map(c => c.name);
        else
            children = (await this.queryShelf()).map(c => c.name);

        let original = name;
        let n = 1;

        while (children.filter(c => !!c).some(c => c.toLocaleUpperCase() === name.toLocaleUpperCase())) {
            name = original + " (" + n + ")";
            n += 1
        }

        return name;
    }

    async createGroup(parent_id, name, node_type = NODE_TYPE_GROUP) {
        let {id} = await this.addNode({
            name: await this._ensureUnique(parent_id, name),
            type: node_type,
            parent_id: parent_id
        });

        return this.getNode(id);
    }

    async renameGroup(id, new_name) {
        let group = await this.getNode(id);
        if (group.name !== new_name) {
            group.name = await this._ensureUnique(group.parent_id, new_name);
            await this.updateNode(group);
        }
        return group;
    }

    async addSeparator(parent_id) {
        let {id} = await this.addNode({
            name: "-",
            type: NODE_TYPE_SEPARATOR,
            parent_id: parent_id
        });

        return this.getNode(id);
    }

    async moveNodes(ids, dest_id) {
        let nodes = await this.getNodes(ids);

        for (let n of nodes) {
            n.parent_id = dest_id;
            n.name = await this._ensureUnique(dest_id, n.name);
        }

        await this.updateNodes(nodes);
        return this.queryFullSubtree(ids);
    }

    async copyNodes(ids, dest_id) {
        let all_nodes = await this.queryFullSubtree(ids);

        for (let n of all_nodes) {
            let old_id = n.id;
            if (ids.some(n => n === old_id))
                n.parent_id = dest_id;
            n.name = await this._ensureUnique(dest_id, n.name);
            delete n.id;
            delete n.date_modified;
            await this.addNode(n, false);
            n.old_id = old_id;
            for (let nn of all_nodes) {
                if (nn.parent_id === old_id)
                    nn.parent_id = n.id;
            }
        }

        return all_nodes;
    }

    async deleteNodes(ids) {
        let all_nodes = await this.queryFullSubtree(ids);

        return this.deleteNodesInternal(all_nodes.map(n => n.id));
    }

    async addBookmark(data, node_type = NODE_TYPE_BOOKMARK) {
        let group;

        if (data.parent_id) {
            data.parent_id = parseInt(data.parent_id);
        }
        else {
            group = await this._getGroup(data.path);
            data.parent_id = group.id;
            delete data.path;
        }

        data.name = await this._ensureUnique(data.parent_id, data.name);

        data.type = node_type;
        data.tag_list = this._splitTags(data.tags);
        this.addTags(data.tag_list);

        return this.addNode(data);
    }

    async importBookmark(data) {
        let group;

        group = await this._getGroup(data.path);
        data.parent_id = group.id;
        delete data.path;

        data.name = await this._ensureUnique(data.parent_id, data.name);

        data.tag_list = this._splitTags(data.tags);
        this.addTags(data.tag_list);

        return this.addNode(data, false);
    }

    async updateBookmark(data) {
        let update = {};

        Object.assign(update, data);

        delete update.text;
        delete update.data;
        delete update._path;
        delete update.a_attr;
        delete update.parent;
        delete update.li_attr;
        delete update._overdue;
        delete update._extended_todo;

        update.tag_list = this._splitTags(update.tags);
        this.addTags(update.tag_list);

        return this.updateNode(update);
    }
}



// let backend = new HTTPBackend("http://localhost:31800", "default:default");
let backend = new IDBBackend();

export {backend};
