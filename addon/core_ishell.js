import {backend} from "./backend.js";
import {renderPath} from "./core_automation.js";
import {NODE_TYPE_GROUP, NODE_TYPE_SHELF} from "./storage_constants.js";
import {browseNode} from "./core_bookmarking.js";

export async function scrapyardListShelves(sender) {
    if (!sender.ishell)
        throw new Error();

    let shelves = await backend.listShelves();
    return shelves.map(n => ({name: n.name}));
}

export async function scrapyardListGroups(sender) {
    if (!sender.ishell)
        throw new Error();

    let shelves = await backend.listShelves();
    shelves = shelves.map(n => ({name: n.name}));

    let groups = await backend.listGroups();
    groups.forEach(n => renderPath(n, groups));
    groups = groups.map(n => ({name: n.name, path: n.path}));

    return [...shelves, ...groups];
}

export async function scrapyardListTags(sender) {
    if (!sender.ishell)
        throw new Error();

    let tags = await backend.queryTags();
    return tags.map(t => ({name: t.name.toLocaleLowerCase()}));
}

export async function scrapyardListNodes(message, sender) {
    if (!sender.ishell)
        throw new Error();

    delete message.type;

    let no_shelves = message.types && !message.types.some(t => t === NODE_TYPE_SHELF);

    if (message.types)
        message.types = message.types.concat([NODE_TYPE_SHELF]);

    message.path = backend.expandPath(message.path);

    let nodes = await backend.listNodes(message);

    for (let node of nodes) {
        if (node.type === NODE_TYPE_GROUP) {
            renderPath(node, nodes);
        }

        if (node.stored_icon)
            node.icon = await backend.fetchIcon(node.id);
    }
    if (no_shelves)
        return nodes.filter(n => n.type !== NODE_TYPE_SHELF);
    else
        return nodes;
}

export function scrapyardBrowseNode(message, sender) {
    if (!sender.ishell)
        throw new Error();

    if (message.node.uuid)
        backend.getNode(message.node.uuid, true).then(node => browseNode(node));
    else
        browseNode(message.node);
}
