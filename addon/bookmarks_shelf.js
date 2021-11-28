import {EntityManager} from "./bookmarks.js";
import {byPosition, EVERYTHING, NODE_TYPE_SHELF, NODE_TYPE_UNLISTED} from "./storage.js";
import {Query} from "./storage_query.js";
import {Group} from "./bookmarks_group.js";
import {Node} from "./storage_entities.js";

class ShelfManager extends EntityManager {

    add(name) {
        return Group.add(null, name, NODE_TYPE_SHELF);
    }

    async listContent(shelfName) {
        let nodes = [];

        if (shelfName === EVERYTHING) {
            nodes = await Node.get();
            nodes = nodes.filter(n => !(n._unlisted || n.type === NODE_TYPE_UNLISTED));
        }
        else {
            let shelfNode = await Query.shelf(shelfName);
            nodes = await Query.fullSubtree(shelfNode.id);
        }

        if (nodes)
            nodes.sort(byPosition);

        return nodes;
    }

}

export let Shelf = new ShelfManager();
