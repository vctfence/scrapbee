import {nativeBackend} from "./backend_native.js";
import UUID from "./lib/uuid.js";
import {
    isContainer, isBuiltInShelf, byPosition,
    TODO_NAMES, TODO_STATES,
    CLOUD_SHELF_NAME, CLOUD_SHELF_UUID,
    DEFAULT_SHELF_NAME, DEFAULT_SHELF_UUID,
    FIREFOX_SHELF_NAME, FIREFOX_SHELF_UUID,
    NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NAMES
} from "./storage.js";
import {settings} from "./settings.js";
import {getFavicon, getFaviconFromTab} from "./favicon.js";
import {send, receiveExternal} from "./proxy.js";
import {getActiveTab} from "./utils_browser.js";
import {getMimetypeExt} from "./utils.js";
import {parseHtml} from "./utils_html.js";
import {fetchText} from "./utils_io.js";
import {ishellBackend} from "./backend_ishell.js";
import {browseNode, captureTab, isSpecialPage, notifySpecialPage, packUrlExt} from "./bookmarking.js";
import {Query} from "./storage_query.js";
import {Path} from "./path.js";
import {Group} from "./bookmarks_group.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Comments, Icon, Node} from "./storage_entities.js";

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

    window.postMessage({type: "SCRAPYARD_ID_REQUESTED", sender}, "*");
    return browser.runtime.getManifest().version;
};

export async function setUpBookmarkMessage(message, sender, activeTab) {
    // by design, messages from iShell builtin Scrapyard commands always contain "search" parameter
    const automation = !(ishellBackend.isIShell(sender.id) && message.search);

    if (automation)
        sanitizeIncomingObject(message);

    message.__automation = automation;

    if (message.type === NODE_TYPE_ARCHIVE && message.url === "")
        message.uri = undefined;
    else if (!message.uri)
        message.uri = message.url || activeTab.url;

    if (message.uri === null || message.uri === undefined || isSpecialPage(message.uri)) {
        notifySpecialPage();
        return false;
    }

    if (!message.name)
        message.name = message.title || activeTab.title;

    if (message.icon === "" || message.pack)
        message.icon = undefined;
    else if (!message.icon && !message.local)
        message.icon = await getFaviconFromTab(activeTab);

    const path = Path.expand(message.path);
    const group = await Group.getOrCreateByPath(path);
    message.parent_id = group.id;
    delete message.path;

    // adding bookmark from ishell, take preparations in UI
    if (!automation) {
        try {
            Bookmark.setTentativeId(message);
            await send.beforeBookmarkAdded({node: message});
        } catch (e) {
            console.error(e);
        }
    }

    return true;
}

export async function setUpLocalFileCapture(message) {
    if (message.uri?.startsWith("http"))
        throw new Error("HTTP URL is processed as a local path.");

    let local_uri;
    if (await nativeBackend.probe()) {
        message.uri = message.uri.replace(/^file:\/+/i, "");

        message.__local_uuid = UUID.numeric();
        await nativeBackend.post(`/serve/set_path/${message.__local_uuid}`, {path: message.uri});
        local_uri = nativeBackend.url(`/serve/file/${message.__local_uuid}/`);
        message.uri = "";
        return local_uri;
    }
    else {
        throw new Error("Can not connect to the helper application.");
    }
}

export async function cleanUpLocalFileCapture(message) {
    if (message.local)
        await nativeBackend.fetch(`/serve/release_path/${message.__local_uuid}`);
}

receiveExternal.scrapyardAddBookmark = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    message.type = NODE_TYPE_BOOKMARK;

    if (!await setUpBookmarkMessage(message, sender, await getActiveTab()))
        return;

    if (message.icon === true || message.title === true) {
        try {
            const content = await fetchText(message.uri);
            const doc = parseHtml(content);

            if (message.icon === true)
                message.icon = await getFavicon(message.uri, doc);

            if (message.title === true) {
                const titleElement = doc.querySelector("title");
                if (titleElement)
                    message.name = titleElement.textContent;
                else
                    message.name = "Untitled";
            }
        }
        catch (e) {
            if (message.icon === true)
                message.icon = undefined;

            if (message.title === true)
                message.name = "Untitled";

            console.error(e);
        }
    }

    return Bookmark.add(message, NODE_TYPE_BOOKMARK)
        .then(async bookmark => {

            if (message.comments)
                await Bookmark.storeComments(bookmark.id, message.comments);

            if (message.__automation && message.select)
                send.bookmarkCreated({node: bookmark});
            else if (!message.__automation)
                send.bookmarkAdded({node: bookmark});

            return bookmark.uuid;
        });
};

receiveExternal.scrapyardAddArchive = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    let activeTab = await getActiveTab();

    message.type = NODE_TYPE_ARCHIVE;

    if (!await setUpBookmarkMessage(message, sender, activeTab))
        return;

    if (!message.content_type)
        message.content_type = getMimetypeExt(message.uri);

    let saveContent = (bookmark, content) => {
        return Bookmark.storeArchive(bookmark.id, content, message.pack ? "text/html" : message.content_type)
            .then(() => {
                if (message.__automation && message.select)
                    send.bookmarkCreated({node: bookmark});
                else if (!message.__automation)
                    send.bookmarkAdded({node: bookmark});

                return bookmark.uuid;
            })
    };

    return Bookmark.add(message, NODE_TYPE_ARCHIVE)
        .then(async bookmark => {

            if (message.comments)
                await Bookmark.storeComments(bookmark.id, message.comments);

            if (message.local) {
                const local_uri = await setUpLocalFileCapture(message);

                let content;
                if (message.content_type === "text/html") {
                    const page = await packUrlExt(local_uri, message.hide_tab);
                    if (page.icon && (message.icon === null || message.icon === undefined)) {
                        bookmark.icon = page.icon
                        await Bookmark.storeIcon(bookmark);
                    }

                    if (page.title)
                        bookmark.name = page.title;

                    content = page.html;
                }
                else {
                    const response = await fetch(local_uri);
                    if (response.ok) {
                        message.content_type = response.headers.get("content-type") || message.content_type;
                        content = await response.arrayBuffer();
                    }
                }

                await cleanUpLocalFileCapture(message);

                bookmark.uri = "";
                await Bookmark.update(bookmark);

                return saveContent(bookmark, content);
            }
            else if (message.pack) {
                const page = await packUrlExt(message.url, message.hide_tab);
                if (page.icon) {
                    bookmark.icon = page.icon
                    await Bookmark.storeIcon(bookmark);
                }

                bookmark.name = page.title;

                await Bookmark.update(bookmark);

                return saveContent(bookmark, page.html);
            }
            else if (message.content) {
                return saveContent(bookmark, message.content)
            }
            else {
                Object.assign(bookmark, message);
                bookmark.__tab_id = activeTab.id;
                captureTab(activeTab, bookmark);

                return bookmark.uuid;
            }
        });
};

async function nodeToAPIObject(node) {
    if (node) {
        const comments =
            node.has_comments
                ? await Comments.get(node.id)
                : undefined;

        const icon =
            node.stored_icon
                ? await Icon.get(node.id)
                : node.icon;

        const uuid =
            isBuiltInShelf(node.name)
                ? node.name.toLowerCase()
                : node.uuid;

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
            options.todo_state = TODO_NAMES[node.todo_state];

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
        const API_UUID_TO_DB = {
            [CLOUD_SHELF_NAME]: CLOUD_SHELF_UUID,
            [FIREFOX_SHELF_NAME]: FIREFOX_SHELF_UUID,
            [DEFAULT_SHELF_NAME]: DEFAULT_SHELF_UUID,
        };

        const uuid =
            isBuiltInShelf(message.uuid)
                ? API_UUID_TO_DB[message.uuid]
                : message.uuid;

        const node = await Node.getByUUID(uuid);
        container = node && isContainer(node);
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
        const node = await Group.getByPath(path);
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
