import {receiveExternal} from "./proxy.js";
import {
    BROWSER_EXTERNAL_NAME,
    DEFAULT_SHELF_NAME, DONE_SHELF_NAME, EVERYTHING, FIREFOX_BOOKMARK_MENU,
    FIREFOX_BOOKMARK_UNFILED,
    NODE_TYPE_GROUP,
    NODE_TYPE_SHELF, TODO_SHELF_NAME
} from "./storage.js";
import {ishellBackend} from "./backend_ishell.js";
import {browseNode} from "./bookmarking.js";
import {Query} from "./storage_query.js";
import {Path} from "./path.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Icon, Node} from "./storage_entities.js";

receiveExternal.scrapyardListShelves = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let shelves = await Query.allShelves();
    return shelves.map(n => ({name: n.name}));
};

receiveExternal.scrapyardListGroups = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let shelves = await Query.allShelves();
    shelves = shelves.map(n => ({name: n.name}));
    const builtin = [EVERYTHING, TODO_SHELF_NAME, DONE_SHELF_NAME].map(s => ({name: s}));

    shelves = [...builtin, ...shelves];

    let groups = await Query.allGroups();
    groups.forEach(n => renderPath(n, groups));
    groups = groups.map(n => ({name: n.name, path: n.path}));

    return [...shelves, ...groups];
};

receiveExternal.scrapyardListTags = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let tags = []; //await bookmarkManager.queryTags();
    return tags.map(t => ({name: t.name.toLocaleLowerCase()}));
};

receiveExternal.scrapyardListNodes = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    delete message.type;

    let no_shelves = message.types && !message.types.some(t => t === NODE_TYPE_SHELF);

    if (message.types)
        message.types = message.types.concat([NODE_TYPE_SHELF]);

    message.path = Path.expand(message.path);

    let nodes = await Bookmark.list(message);

    for (let node of nodes) {
        if (node.type === NODE_TYPE_GROUP) {
            renderPath(node, nodes);
        }

        if (node.stored_icon)
            node.icon = await Icon.get(node.id);
    }
    if (no_shelves)
        return nodes.filter(n => n.type !== NODE_TYPE_SHELF);
    else
        return nodes;
};

receiveExternal.scrapyardBrowseNode = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    if (message.node.uuid)
        Node.getByUUID(message.node.uuid).then(node => browseNode(node));
    else
        browseNode(message.node);
};

function renderPath(node, nodes) {
    let path = [];
    let parent = node;

    while (parent) {
        path.push(parent);
        parent = nodes.find(n => n.id === parent.parent_id);
    }

    if (path[path.length - 1].name === DEFAULT_SHELF_NAME) {
        path[path.length - 1].name = "~";
    }

    if (path.length >= 2 && path[path.length - 1].external === BROWSER_EXTERNAL_NAME
        && path[path.length - 2].external_id === FIREFOX_BOOKMARK_UNFILED) {
        path.pop();
        path[path.length - 1].name = "@@";
    }

    if (path.length >= 2 && path[path.length - 1].external === BROWSER_EXTERNAL_NAME
        && path[path.length - 2].external_id === FIREFOX_BOOKMARK_MENU) {
        path.pop();
        path[path.length - 1].name = "@";
    }

    node.path = path.reverse().map(n => n.name).join("/");
}
