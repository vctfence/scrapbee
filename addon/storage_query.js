import {
    byPosition,
    DONE_SHELF_NAME, EVERYTHING,
    isContainer, isVirtualShelf,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF,
    NODE_TYPE_UNLISTED,
    TODO_SHELF_NAME,
    TODO_STATE_DONE
} from "./storage.js";

import {EntityIDB} from "./storage_idb.js";
import {Node} from "./storage_entities.js";

class QueryIDB extends EntityIDB {

    allNodeIDs() {
        return this._db.nodes.orderBy("id").keys();
    }

    async _selectDirectChildrenIdsOf(id, children) {
        await this._db.nodes.where("parent_id").equals(id).each(n => children.push(n.id));
    }

    async selectAllChildrenIdsOf(id, children) {
        let directChildren = [];
        await this._db.nodes.where("parent_id").equals(id)
            .each(n => directChildren.push([n.id, isContainer(n)]));

        if (directChildren.length) {
            for (let child of directChildren) {
                children.push(child[0]);
                if (child[1])
                    await this.selectAllChildrenIdsOf(child[0], children);
            }
        }
    }

    async fullSubtreeOfIDs(nodeIDs) {
        if (!Array.isArray(nodeIDs))
            nodeIDs = [nodeIDs];

        let children = [];

        for (let id of nodeIDs) {
            children.push(id);
            await this.selectAllChildrenIdsOf(id, children);
        }

        return children;
    }

    async _selectAllChildrenOf(node, children, preorder, level) {
        let directChildren = await this._db.nodes.where("parent_id").equals(node.id).toArray();

        if (directChildren.length) {
            if (preorder)
                directChildren.sort(byPosition);

            for (let child of directChildren) {
                if (level !== undefined)
                    child.__level = level;

                children.push(child);

                if (isContainer(child))
                    await this._selectAllChildrenOf(child, children, preorder, level !== undefined? level + 1: undefined);
            }
        }
    }

    async fullSubtree(nodeIDs, preorder, level) {
        if (!Array.isArray(nodeIDs))
            nodeIDs = [nodeIDs];

        let nodes = await Node.get(nodeIDs);
        let children = [];

        if (preorder)
            nodes.sort(byPosition);

        for (let node of nodes) {
            if (node) {
                if (level !== undefined)
                    node.__level = level;

                children.push(node);

                if (isContainer(node))
                    await this._selectAllChildrenOf(node, children, preorder, level !== undefined? level + 1: undefined);
            }
        }

        return children;
    }

    async nodes(group, options) {
        let {search, tags, date, date2, period, types, path, limit, depth, order} = options;
        let searchrx = search? new RegExp(search, "i"): null;
        let query = this._db.nodes;

        path = path || EVERYTHING;

        const todoShelf = path?.toUpperCase() === TODO_SHELF_NAME;
        const doneShelf = path?.toUpperCase() === DONE_SHELF_NAME;
        const virtualShelf = isVirtualShelf(path);

        if (group) {
            let subtree = [];

            if (depth === "group")
                await this._selectDirectChildrenIdsOf(group.id, subtree);
            else if (depth === "root+subtree") {
                await this.selectAllChildrenIdsOf(group.id, subtree);
                subtree.push(group.id);
            }
            else // "subtree"
                await this.selectAllChildrenIdsOf(group.id, subtree);

            query = query.where("id").anyOf(subtree);
        }

        if (date) {
            date = (new Date(date)).getTime();
            date2 = (new Date(date2)).getTime();
            if (isNaN(date))
                date = null;
            if (isNaN(date2))
                date2 = null;
            if (date && (period === "before" || period === "after"))
                period = period === "after" ? 1 : -1;
            else if (date && date2 && period === "between")
                period = 2;
            else
                period = 0;
        }

        let byOptions = node => {
            let result = virtualShelf? true: !!group;

            if (types)
                result = result && types.some(t => t == node.type);

            if (todoShelf)
                result = result && node.todo_state && node.todo_state < TODO_STATE_DONE;
            else if (doneShelf)
                result = result && node.todo_state && node.todo_state >= TODO_STATE_DONE;

            if (search)
                result = result && (searchrx.test(node.name) || searchrx.test(node.uri));
            else if (tags) {
                if (node.tag_list) {
                    let intersection = tags.filter(value => node.tag_list.some(t => t.startsWith(value)));
                    result = result && intersection.length > 0;
                }
                else
                    result = false;
            }
            else if (date) {
                const nodeMillis = node.date_added?.getTime? node.date_added.getTime(): undefined;

                if (nodeMillis) {
                    let nodeDate = new Date(nodeMillis);
                    nodeDate.setUTCHours(0, 0, 0, 0);
                    nodeDate = nodeDate.getTime();

                    if (period === 0)
                        result = result && date === nodeDate;
                    else if (period === 1)
                        result = result && date < nodeDate;
                    else if (period === -1)
                        result = result && date > nodeDate;
                    else if (period === 2)
                        result = result && nodeDate >= date && nodeDate <= date2;
                }
                else
                    result = false;
            }

            return result;
        };

        query = query.filter(byOptions);

        if (limit)
            query = query.limit(limit);

        return await query.toArray();
    }

    // returns nodes containing only the all given words
    async nodesByIndex(ids, words, index) {
        let allMatchedNodes = [];
        let matches = {};
        let wordCount = {};

        const selectIndex = index => {
            switch (index) {
                case "notes":
                    return this._db.index_notes;
                case "comments":
                    return this._db.index_comments;
                default:
                    return this._db.index;
            }
        };

        const query = ids
            ? word => selectIndex(index).where("words").startsWith(word).and(i => ids.some(id => id === i.node_id))
            : word => selectIndex(index).where("words").startsWith(word);

        for (let word of words) {
            let matched_nodes = matches[word] = [];
            await query(word).each(w => matched_nodes.push(w.node_id));
            allMatchedNodes = [...allMatchedNodes, ...matched_nodes]
                .filter((w, i, a) => a.indexOf(w) === i); // distinct
        }

        for (let n of allMatchedNodes) {
            wordCount[n] = 0;

            for (let word of words) {
                if (matches[word].some(i => i === n))
                    wordCount[n] += 1;
            }
        }

        if (ids)
            return Node.get(ids.filter(id => wordCount[id] === words.length));
        else {
            let nodesWithAllWords = [];

            for (const [id, count] of Object.entries(wordCount)) {
                if (count === words.length)
                    nodesWithAllWords.push(parseInt(id));
            }

            return Node.get(nodesWithAllWords);
        }
    }

    async unlisted(name) {
        let where = this._db.nodes.where("type").equals(NODE_TYPE_UNLISTED);

        if (name) {
            name = name.toLocaleUpperCase();
            return await where.and(n => name === n.name.toLocaleUpperCase()).first();
        }
        else
            return await where.toArray();
    }

    async shelf(name) {
        let where = this._db.nodes.where("type").equals(NODE_TYPE_SHELF).and(n => !n.parent_id);

        if (name) {
            name = name.toLocaleUpperCase();
            return await where.and(n => name === n.name.toLocaleUpperCase()).first();
        }
        else
            return await where.toArray();
    }

    async allShelves() {
        return this.shelf();
    }

    async allGroups() {
        const nodes = await this._db.nodes.where("type").anyOf([NODE_TYPE_SHELF, NODE_TYPE_GROUP]).toArray();
        return nodes.sort(byPosition);
    }

    subgroup(parentId, name) {
        name = name.toLocaleUpperCase();
        return this._db.nodes.where("parent_id").equals(parentId)
            .and(n => n.type === NODE_TYPE_GROUP && name === n.name.toLocaleUpperCase())
            .first();
    }

    todo() {
        return this._db.nodes.where("todo_state").below(TODO_STATE_DONE).toArray();
    }

    done() {
        return this._db.nodes.where("todo_state").aboveOrEqual(TODO_STATE_DONE).toArray();
    }
}

export let Query = new QueryIDB();