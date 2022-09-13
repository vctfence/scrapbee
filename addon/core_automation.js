import {helperApp} from "./helper_app.js";
import UUID from "./uuid.js";
import {
    isContainerNode, isBuiltInShelf, byPosition,
    TODO_STATE_NAMES, TODO_STATES,
    CLOUD_SHELF_NAME, CLOUD_SHELF_UUID,
    DEFAULT_SHELF_NAME, DEFAULT_SHELF_UUID,
    BROWSER_SHELF_NAME, BROWSER_SHELF_UUID,
    NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NAMES
} from "./storage.js";
import {settings} from "./settings.js";
import {getFaviconFromContent, getFaviconFromTab} from "./favicon.js";
import {send, receiveExternal, sendLocal} from "./proxy.js";
import {getActiveTab} from "./utils_browser.js";
import {getMimetypeExt} from "./utils.js";
import {fetchText} from "./utils_io.js";
import {ishellBackend} from "./backend_ishell.js";
import {captureTab, isSpecialPage, notifySpecialPage, packUrlExt} from "./bookmarking.js";
import {Query} from "./storage_query.js";
import {Path} from "./path.js";
import {Folder} from "./bookmarks_folder.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Comments, Icon, Node} from "./storage_entities.js";
import {browseNode} from "./browse.js";

export function isAutomationAllowed(sender) {
    const extension_whitelist = settings.extension_whitelist();

    return ishellBackend.isIShell(sender.id)
        || (settings.enable_automation() && (!extension_whitelist
            || extension_whitelist.some(id => id.toLowerCase() === sender.id.toLowerCase())));
}

const ALLOWED_API_FIELDS = ["type", "uuid", "title", "url", "icon", "path", "tags", "details", "todo_state", "todo_date",
                            "comments", "container", "content", "content_type", "pack", "local", "select", "refresh",
                            "hide_tab"];

function sanitizeIncomingObject(object) {
    for (let key of Object.keys(object))
        if (!ALLOWED_API_FIELDS.some(k => k === key))
            delete object[key];

    return object;
}

receiveExternal.scrapyardGetVersion = (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    sendLocal.scrapyardIdRequested({senderId: sender.id});
    return browser.runtime.getManifest().version;
};

export async function createBookmarkNode(message, sender, activeTab) {
    const node = {...message};

    sanitizeIncomingObject(node);

    node.__automation = true;

    if (node.type === NODE_TYPE_ARCHIVE && node.url === "")
        node.uri = undefined;
    else if (!node.uri)
        node.uri = node.url || activeTab.url;

    if (node.uri === null || node.uri === undefined || isSpecialPage(node.uri)) {
        notifySpecialPage();
        return null;
    }

    if (!node.name)
        node.name = node.title || activeTab.title;

    if (node.icon === "" || node.pack)
        node.icon = undefined;
    else if (!node.icon && !node.local)
        node.icon = await getFaviconFromTab(activeTab);

    const path = Path.expand(node.path);
    const folder = await Folder.getOrCreateByPath(path);
    node.parent_id = folder.id;
    delete node.path;

    return node;
}

receiveExternal.scrapyardAddBookmark = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    message.type = NODE_TYPE_BOOKMARK;

    const node = await createBookmarkNode(message, sender, await getActiveTab());
    if (!node)
        return;

    if (node.icon === true || node.title === true) {
        try {
            const content = await fetchText(node.uri);

            if (node.icon === true)
                node.icon = await getFaviconFromContent(node.uri, content);

            if (node.title === true) {
                const title = content.match(/<title[^>]*>([^<]*)</i)?.[1]?.trim();
                node.name = title || "Untitled";
            }
        }
        catch (e) {
            if (node.icon === true)
                node.icon = undefined;

            if (node.title === true)
                node.name = "Untitled";

            console.error(e);
        }
    }

    return Bookmark.add(node, NODE_TYPE_BOOKMARK)
        .then(async bookmark => {
            if (node.comments)
                await Bookmark.storeComments(bookmark.id, node.comments);

            if (node.select)
                send.bookmarkCreated({node: bookmark});

            return bookmark.uuid;
        });
};

receiveExternal.scrapyardAddArchive = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    let activeTab = await getActiveTab();

    message.type = NODE_TYPE_ARCHIVE;

    const node = await createBookmarkNode(message, sender, activeTab);
    if (!node)
        return;

    if (!node.name || node.name === true)
        node.name = "Unnamed";

    if (!node.content_type)
        node.content_type = getMimetypeExt(node.uri);

    let saveContent = (bookmark, content) => {
        const contentType = node.pack? "text/html": node.content_type;

        return Bookmark.storeArchive(bookmark, content, contentType, bookmark.__index)
            .then(() => {
                if (node.select)
                    send.bookmarkCreated({node: bookmark});

                return bookmark.uuid;
            });
    };

    return Bookmark.add(node, NODE_TYPE_ARCHIVE)
        .then(async bookmark => {

            if (node.comments)
                await Bookmark.storeComments(bookmark.id, node.comments);

            if (node.local) {
                let content = await downloadLocalContent(bookmark);

                bookmark.uri = "";
                await Bookmark.update(bookmark);

                return saveContent(bookmark, content);
            }
            else if (node.pack) {
                const page = await packUrlExt(node.url, node.hide_tab);

                if (page.icon) {
                    bookmark.icon = page.icon
                    await Bookmark.storeIcon(bookmark);
                }

                bookmark.name = page.title;

                await Bookmark.update(bookmark);

                return saveContent(bookmark, page.html);
            }
            else if (node.content) {
                return saveContent(bookmark, node.content)
            }
            else {
                Object.assign(bookmark, node);
                bookmark.__tab_id = activeTab.id;
                captureTab(activeTab, bookmark);

                return bookmark.uuid;
            }
        });
};

async function downloadLocalContent(node) {
    const localURI = await setUpLocalFileCapture(node);

    let content;
    if (node.content_type === "text/html") {
        const page = await packUrlExt(localURI, node.hide_tab);

        if (page.icon && (node.icon === null || node.icon === undefined)) {
            node.icon = page.icon
            await Bookmark.storeIcon(node);
        }

        if (page.title)
            node.name = page.title;

        content = page.html;
    }
    else {
        const response = await fetch(localURI);
        if (response.ok) {
            node.content_type = response.headers.get("content-type") || node.content_type;
            content = await response.arrayBuffer();
        }
    }

    await cleanUpLocalFileCapture(node);
    return content;
}

async function setUpLocalFileCapture(message) {
    if (message.uri?.startsWith("http"))
        throw new Error("HTTP URL is processed as a local path.");

    let local_uri;
    if (await helperApp.probe()) {
        message.uri = message.uri.replace(/^file:\/+/i, "");

        message.__local_uuid = UUID.numeric();
        await helperApp.post(`/serve/set_path/${message.__local_uuid}`, {path: message.uri});
        local_uri = helperApp.url(`/serve/file/${message.__local_uuid}/`);
        message.uri = "";
        return local_uri;
    }
    else {
        throw new Error("Can not connect to the helper application.");
    }
}

async function cleanUpLocalFileCapture(message) {
    if (message.local)
        await helperApp.fetch(`/serve/release_path/${message.__local_uuid}`);
}

async function nodeToAPIObject(node) {
    if (node) {
        const comments =
            node.has_comments
                ? await Comments.get(node)
                : undefined;

        const icon =
            node.stored_icon
                ? await Icon.get(node.id)
                : node.icon;

        const uuid = node.uuid;

        const options = {
            type: NODE_TYPE_NAMES[node.type],
            uuid: uuid,
            title: node.name || ""
        };

        if (node.uri)
            options.url = node.uri;

        if (icon)
            options.icon = icon;

        if (node.tags)
            options.tags = node.tags;

        if (node.details)
            options.details = node.details;

        if (node.todo_state)
            options.todo_state = TODO_STATE_NAMES[node.todo_state];

        if (node.todo_date)
            options.todo_date = node.todo_date;

        if (comments)
            options.comments = comments;

        if (node.container)
            options.container = node.container;

        return options;
    }
}

receiveExternal.scrapyardGetUuid = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    const node = await Node.getByUUID(message.uuid);

    return nodeToAPIObject(node);
};

receiveExternal.scrapyardListUuid = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    let entries;
    let container;
    if (message.uuid === null) {
        entries = await Query.allShelves();
        container = true;
    }
    else {
        const node = await Node.getByUUID(message.uuid);
        container = node && isContainerNode(node);

        if (container)
            entries = await Node.getChildren(node.id);
        else
            entries = [];
    }

    entries.sort(byPosition);

    let result = [];

    for (let entry of entries) {
        result.push(await nodeToAPIObject(entry));
    }

    return container? result: undefined;
};

receiveExternal.scrapyardListPath = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    let entries;
    let container;

    if (message.path === "/") {
        entries = await Query.allShelves();
        container = true;
    }
    else {
        const path = Path.expand(message.path);
        const node = await Folder.getByPath(path);

        container = !!node;

        if (container)
            entries = await Node.getChildren(node.id);
        else
            entries = [];
    }

    entries.sort(byPosition);

    let result = [];

    for (let entry of entries) {
        result.push(await nodeToAPIObject(entry));
    }

    return container? result: undefined;
};

receiveExternal.scrapyardUpdateUuid = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    if (isBuiltInShelf(message.uuid))
        throw new Error("Can not modify built-in shelves.");

    const refresh = message.refresh;

    delete message.type;
    sanitizeIncomingObject(message);

    if (message.url) {
        message.uri = message.url;
        delete message.url;
    }

    message.name = message.title || "";
    delete message.title;

    if (message.todo_state) {
        if (typeof message.todo_state === "number"
            && (message.todo_state < TODO_STATE_TODO
                || message.todo_state > TODO_STATE_CANCELLED)) {
            message.todo_state = undefined;
        }
        else if (typeof message.todo_state === "string")
            message.todo_state = TODO_STATES[message.todo_state.toUpperCase()];
    }

    const node = await Node.getByUUID(message.uuid);

    Object.assign(node, message);

    if (message.icon === "") {
        message.icon = undefined;
        message.stored_icon = undefined;
    }
    else if (message.icon)
        await Bookmark.storeIcon(node);

    if (message.hasOwnProperty("comments")) {
        await Bookmark.storeComments(node.id, message.comments);
        delete node.comments;
    }

    await Bookmark.update(node);

    if (refresh)
        send.nodesUpdated();
};

receiveExternal.scrapyardRemoveUuid = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    const node = await Node.getByUUID(message.uuid);

    if (node)
        await Bookmark.delete(node.id);

    if (message.refresh)
        send.nodesUpdated();
};

receiveExternal.scrapyardPackPage = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    if (message.local) {
        if (!message.uri)
            message.uri = message.url;

        let local_uri = await setUpLocalFileCapture(message);

        let result = await packUrlExt(local_uri, message.hide_tab);

        await cleanUpLocalFileCapture(message);

        return result;
    }
    else
        return packUrlExt(message.url, message.hide_tab);
};

receiveExternal.scrapyardBrowseUuid = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    const node = await Node.getByUUID(message.uuid);
    if (node)
        browseNode(node);
};
