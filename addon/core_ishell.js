import {receiveExternal, send, sendLocal} from "./proxy.js";
import {
    BROWSER_EXTERNAL_TYPE,
    DEFAULT_SHELF_NAME, DONE_SHELF_NAME, EVERYTHING_SHELF_NAME, FIREFOX_BOOKMARK_MENU,
    FIREFOX_BOOKMARK_UNFILED, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES,
    NODE_TYPE_FOLDER, NODE_TYPE_SHELF, TODO_SHELF_NAME
} from "./storage.js";
import {ishellConnector} from "./plugin_ishell.js";
import {getActiveTabMetadata} from "./bookmarking.js";
import {Query} from "./storage_query.js";
import {Path} from "./path.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Icon, Node} from "./storage_entities.js";
import {Folder} from "./bookmarks_folder.js";
import {browseNode} from "./browse.js";
import {showNotification} from "./utils_browser.js";

receiveExternal.scrapyardListShelvesIshell = async (message, sender) => {
    if (!ishellConnector.isIShell(sender.id))
        throw new Error();

    let shelves = await Query.allShelves();
    return shelves.map(n => ({name: n.name}));
};

receiveExternal.scrapyardListGroupsIshell = async (message, sender) => {
    if (!ishellConnector.isIShell(sender.id))
        throw new Error();

    let shelves = await Query.allShelves();
    shelves = shelves.map(n => ({name: n.name}));
    const builtin = [EVERYTHING_SHELF_NAME, TODO_SHELF_NAME, DONE_SHELF_NAME].map(s => ({name: s}));

    shelves = [...builtin, ...shelves];

    let folders = await Query.allFolders();
    folders.forEach(n => renderPath(n, folders));
    folders = folders.map(n => ({name: n.name, path: n.path}));

    return [...shelves, ...folders];
};

receiveExternal.scrapyardListTagsIshell = async (message, sender) => {
    if (!ishellConnector.isIShell(sender.id))
        throw new Error();

    let tags = []; //await bookmarkManager.queryTags();
    return tags.map(t => ({name: t.name.toLocaleLowerCase()}));
};

receiveExternal.scrapyardListNodesIshell = async (message, sender) => {
    if (!ishellConnector.isIShell(sender.id))
        throw new Error();

    delete message.type;

    let no_shelves = message.types && !message.types.some(t => t === NODE_TYPE_SHELF);

    if (message.types)
        message.types = message.types.concat([NODE_TYPE_SHELF]);

    message.path = Path.expand(message.path);

    let nodes = await Bookmark.list(message);

    for (let node of nodes) {
        if (node.type === NODE_TYPE_FOLDER) {
            renderPath(node, nodes);
        }

        if (node.stored_icon)
            node.icon = await Icon.get(node);
    }
    if (no_shelves)
        return nodes.filter(n => n.type !== NODE_TYPE_SHELF);
    else
        return nodes;
};

receiveExternal.scrapyardBrowseNodeIshell = async (message, sender) => {
    if (!ishellConnector.isIShell(sender.id))
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

    if (path.length >= 2 && path[path.length - 1].external === BROWSER_EXTERNAL_TYPE
        && path[path.length - 2].external_id === FIREFOX_BOOKMARK_UNFILED) {
        path.pop();
        path[path.length - 1].name = "@@";
    }

    if (path.length >= 2 && path[path.length - 1].external === BROWSER_EXTERNAL_TYPE
        && path[path.length - 2].external_id === FIREFOX_BOOKMARK_MENU) {
        path.pop();
        path[path.length - 1].name = "@";
    }

    node.path = path.reverse().map(n => n.name).join("/");
}

receiveExternal.scrapyardAddBookmarkIshell = async (message, sender) => {
    if (!ishellConnector.isIShell(sender.id))
        throw new Error();

    addBookmarkFromIshell(message, NODE_TYPE_BOOKMARK);
}

receiveExternal.scrapyardAddArchiveIshell = async (message, sender) => {
    if (!ishellConnector.isIShell(sender.id))
        throw new Error();

    addBookmarkFromIshell(message, NODE_TYPE_ARCHIVE);
}

receiveExternal.scrapyardAddSiteIshell = async (message, sender) => {
    if (!ishellConnector.isIShell(sender.id))
        throw new Error();

    message.__crawl = true;
    addBookmarkFromIshell(message, NODE_TYPE_ARCHIVE);
}

receiveExternal.scrapyardAddNotesIshell = async (message, sender) => {
    if (!ishellConnector.isIShell(sender.id))
        throw new Error();

    if (!message.name) {
        showNotification({title: "Error", message: "Bookmark name is empty!"});
        return;
    }

    const bookmark = await addBookmarkFromIshell(message, NODE_TYPE_NOTES);
    return browseNode(bookmark, {edit: true});
}

async function addBookmarkFromIshell(message, type) {
    const node = await getActiveTabMetadata();

    node.name = message.name || node.name;
    node.type = type;
    node.tags = message.tags;
    node.todo_state = message.todo_state;
    node.todo_date = message.todo_date;
    node.details = message.details;

    if (message.__crawl)
        node.__crawl = true;

    const path = Path.expand(message.path);
    const folder = await Folder.getOrCreateByPath(path);
    node.parent_id = folder.id;
    delete message.path;

    if (type === NODE_TYPE_NOTES)
        return sendLocal.createNotes({node});
    else
        return sendLocal.captureHighlightedTabs({options: node});
}
