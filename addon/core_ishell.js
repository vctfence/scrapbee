import {bookmarkManager} from "./backend.js";
import {receiveExternal} from "./proxy.js";
import {renderPath} from "./core_automation.js";
import {NODE_TYPE_GROUP, NODE_TYPE_SHELF} from "./storage.js";
import {ishellBackend} from "./backend_ishell.js";
import {browseNode} from "./bookmarking.js";

receiveExternal.scrapyardListShelves = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let shelves = await bookmarkManager.listShelves();
    return shelves.map(n => ({name: n.name}));
};

receiveExternal.scrapyardListGroups = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let shelves = await bookmarkManager.listShelves();
    shelves = shelves.map(n => ({name: n.name}));

    let groups = await bookmarkManager.listGroups();
    groups.forEach(n => renderPath(n, groups));
    groups = groups.map(n => ({name: n.name, path: n.path}));

    return [...shelves, ...groups];
};

receiveExternal.scrapyardListTags = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    let tags = await bookmarkManager.queryTags();
    return tags.map(t => ({name: t.name.toLocaleLowerCase()}));
};

receiveExternal.scrapyardListNodes = async (message, sender) => {
    if (!ishellBackend.isIShell(sender.id))
        throw new Error();

    delete message.type;

    let no_shelves = message.types && !message.types.some(t => t === NODE_TYPE_SHELF);

    if (message.types)
        message.types = message.types.concat([NODE_TYPE_SHELF]);

    message.path = bookmarkManager.expandPath(message.path);

    let nodes = await bookmarkManager.listNodes(message);

    for (let node of nodes) {
        if (node.type === NODE_TYPE_GROUP) {
            renderPath(node, nodes);
        }

        if (node.stored_icon)
            node.icon = await bookmarkManager.fetchIcon(node.id);
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
        bookmarkManager.getNode(message.node.uuid, true).then(node => browseNode(node));
    else
        browseNode(message.node);
};
