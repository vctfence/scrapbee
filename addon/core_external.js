import {nativeBackend} from "./backend_native.js";
import UUID from "./lib/uuid.js";
import {
    DEFAULT_SHELF_NAME,
    FIREFOX_BOOKMARK_MENU,
    FIREFOX_BOOKMARK_UNFILED,
    FIREFOX_SHELF_NAME,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK
} from "./storage_constants.js";
import {settings} from "./settings.js";
import {browseNode, captureTab, isSpecialPage, notifySpecialPage, packUrl, packUrlExt} from "./core_bookmarking.js";
import {getFaviconFromTab} from "./favicon.js";
import {backend} from "./backend.js";
import {send} from "./proxy.js";
import {getActiveTab} from "./utils_browser.js";
import {getMimetypeExt} from "./utils.js";

export function isAutomationAllowed(sender) {
    const extension_whitelist = settings.extension_whitelist();

    return sender.ishell
        || (settings.enable_automation() && (!extension_whitelist
            || extension_whitelist.some(id => id.toLowerCase() === sender.id.toLowerCase())));
}

export function renderPath(node, nodes) {
    let path = [];
    let parent = node;

    while (parent) {
        path.push(parent);
        parent = nodes.find(n => n.id === parent.parent_id);
    }

    if (path[path.length - 1].name === DEFAULT_SHELF_NAME) {
        path[path.length - 1].name = "~";
    }

    if (path.length >= 2 && path[path.length - 1].external === FIREFOX_SHELF_NAME
        && path[path.length - 2].external_id === FIREFOX_BOOKMARK_UNFILED) {
        path.pop();
        path[path.length - 1].name = "@@";
    }

    if (path.length >= 2 && path[path.length - 1].external === FIREFOX_SHELF_NAME
        && path[path.length - 2].external_id === FIREFOX_BOOKMARK_MENU) {
        path.pop();
        path[path.length - 1].name = "@";
    }

    node.path = path.reverse().map(n => n.name).join("/");
}

export async function setUpBookmarkMessage(message, sender, activeTab) {
    if (message.type === NODE_TYPE_ARCHIVE && message.url === "")
        message.uri = "";
    else if (!message.uri)
        message.uri = message.url || activeTab.url;

    const specialPage = isSpecialPage(message.uri);

    if (message.uri === null || message.uri === undefined || specialPage) {
        if (specialPage)
            notifySpecialPage();
        return false;
    }

    if (!message.name)
        message.name = message.title || activeTab.title;

    if (message.icon === "")
        message.icon = null;
    else if (!message.icon)
        message.icon = await getFaviconFromTab(activeTab);

    const path = backend.expandPath(message.path);
    const group = await backend.getGroupByPath(path);
    message.parent_id = group.id;
    delete message.path;

    // by design, messages from iShell builtin Scrapyard commands always contain "search" parameter
    message.__automation = !(sender.ishell && message.search);

    if (!message.__automation) {
        try {
            backend.setTentativeId(message);
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

export async function createBookmarkExternal(message, sender) {
    if (!isAutomationAllowed(sender))
        throw new Error();

    message.type = NODE_TYPE_BOOKMARK;

    if (!await setUpBookmarkMessage(message, sender, await getActiveTab()))
        return;

    return backend.addBookmark(message, NODE_TYPE_BOOKMARK)
        .then(async bookmark => {

            if (message.comments)
                await backend.storeComments(bookmark.id, message.comments);

            if (message.__automation && message.select)
                send.bookmarkCreated({node: bookmark});
            else if (!message.__automation)
                send.bookmarkAdded({node: bookmark});

            return bookmark.uuid;
        });
}

export async function createArchiveExternal(message, sender) {
    if (!isAutomationAllowed(sender))
        throw new Error();

    let activeTab = await getActiveTab();

    message.type = NODE_TYPE_ARCHIVE;

    if (!await setUpBookmarkMessage(message, sender, activeTab))
        return;

    if (!message.content_type)
        message.content_type = getMimetypeExt(message.uri) || "text/html";

    let saveContent = (bookmark, content) => {
        return backend.storeBlob(bookmark.id, content, message.pack ? "text/html" : message.content_type)
            .then(() => {
                if (message.__automation && message.select)
                    send.bookmarkCreated({node: bookmark});
                else if (!message.__automation)
                    send.bookmarkAdded({node: bookmark});

                return bookmark.uuid;
            })
    };

    return backend.addBookmark(message, NODE_TYPE_ARCHIVE)
        .then(async bookmark => {

            if (message.comments)
                await backend.storeComments(bookmark.id, message.comments);

            if (message.local) {
                const local_uri = await setUpLocalFileCapture(message);

                let content;
                if (message.content_type === "text/html")
                    content = await packUrl(local_uri, message.hide_tab);
                else {
                    const response = await fetch(local_uri);
                    if (response.ok)
                        content = await response.arrayBuffer();
                }

                await cleanUpLocalFileCapture(message);

                bookmark.uri = "";
                await backend.updateBookmark(bookmark);

                return saveContent(bookmark, content);
            }
            else if (message.pack) {
                return saveContent(bookmark, await packUrl(message.url, message.hide_tab));
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
}

export async function getNodeExternal(message, sender) {
    if (!isAutomationAllowed(sender))
        throw new Error();

    const node = await backend.getNode(message.uuid, true);

    if (node) {
        const comments = await backend.fetchComments(node.id)

        return {
            uuid: node.uuid,
            title: node.name,
            url: node.uri,
            tags: node.tags,
            details: node.details,
            todo_state: node.todo_state,
            todo_date: node.todo_date,
            comments: comments,
            container: node.container
        }
    }
}

export async function updateNodeExternal(message, sender) {
    if (!isAutomationAllowed(sender))
        throw new Error();

    delete message.type;
    if (message.url)
        message.uri = message.url;
    if (message.title)
        message.name = message.title;

    const node = await backend.getNode(message.uuid, true);

    Object.assign(node, message);

    if (message.icon === "") {
        message.icon = null;
        message.stored_icon = false;
    }
    else if (message.icon)
        await backend.storeIcon(node);

    if (message.hasOwnProperty("comments"))
        await backend.storeComments(node.id, message.comments);

    await backend.updateBookmark(node);

    if (message.refresh)
        send.nodesUpdated();
}

export async function removeNodeExternal(message, sender) {
    if (!isAutomationAllowed(sender))
        throw new Error();

    const node = await backend.getNode(message.uuid, true);

    if (node)
        await backend.deleteNodes(node.id);

    if (message.refresh)
        send.nodesUpdated();
}

export async function packPageExternal(message, sender) {
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
}

export async function browseNodeExternal(message, sender) {
    if (!isAutomationAllowed(sender))
        throw new Error();

    const node = await backend.getNode(message.uuid, true);
    if (node)
        browseNode(node);
}
