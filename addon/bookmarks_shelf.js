import {EntityManager} from "./bookmarks.js";
import {
    byPosition,
    EVERYTHING_SHELF_NAME,
    NODE_TYPE_SHELF,
    NODE_TYPE_UNLISTED
} from "./storage.js";
import {Query} from "./storage_query.js";
import {Folder} from "./bookmarks_folder.js";
import {Node} from "./storage_entities.js";

class ShelfManager extends EntityManager {

    add(name) {
        return Folder.add(null, name, NODE_TYPE_SHELF);
    }

    async listContent(shelfName) {
        let nodes = [];

        if (shelfName === EVERYTHING_SHELF_NAME) {
            nodes = await Node.get();
            nodes = nodes.filter(n => !(n._unlisted || n.type === NODE_TYPE_UNLISTED));
        }
        else {
            const shelfNode = await Query.shelf(shelfName);
            if (shelfNode)
                nodes = await Query.fullSubtree(shelfNode.id);
        }

        if (nodes)
            nodes.sort(byPosition);

        return nodes;
    }

}

export let Shelf = new ShelfManager();
