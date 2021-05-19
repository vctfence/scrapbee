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
import {getFavicon, getFaviconFromTab} from "./favicon.js";
import {backend} from "./backend.js";
import {send, receiveExternal} from "./proxy.js";
import {getActiveTab} from "./utils_browser.js";
import {getMimetypeExt} from "./utils.js";
import {parseHtml} from "./utils_html.js";
import {fetchText} from "./utils_io.js";
import {ishellBackend} from "./backend_ishell.js";

export function isAutomationAllowed(sender) {
    const extension_whitelist = settings.extension_whitelist();

    return ishellBackend.isIShell(sender.id)
        || (settings.enable_automation() && (!extension_whitelist
            || extension_whitelist.some(id => id.toLowerCase() === sender.id.toLowerCase())));
}

receiveExternal.scrapyardGetVersion = (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    window.postMessage({type: "SCRAPYARD_ID_REQUESTED", sender}, "*");
    return browser.runtime.getManifest().version;
};

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
        message.uri = undefined;
    else if (!message.uri)
        message.uri = message.url || activeTab.url;

    const specialPage = isSpecialPage(message.uri);

    if (message.uri === null || message.uri === undefined || specialPage) {
        notifySpecialPage();
        return false;
    }

    if (!message.name)
        message.name = message.title || activeTab.title;

    if (message.icon === "" || message.pack)
        message.icon = undefined;
    else if (!message.icon && !message.local)
        message.icon = await getFaviconFromTab(activeTab);

    const path = backend.expandPath(message.path);
    const group = await backend.getGroupByPath(path);
    message.parent_id = group.id;
    delete message.path;

    // by design, messages from iShell builtin Scrapyard commands always contain "search" parameter
    message.__automation = !(ishellBackend.isIShell(sender.id) && message.search);

    // adding bookmark from ishell, take preparations in UI
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
                message.icon = await getFavicon(message.uri, false, false, doc);

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
                if (message.content_type === "text/html") {
                    const page = await packUrlExt(local_uri, message.hide_tab);
                    if (page.icon && (message.icon === null || message.icon === undefined)) {
                        bookmark.icon = page.icon
                        await backend.storeIcon(bookmark);
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
                await backend.updateBookmark(bookmark);

                return saveContent(bookmark, content);
            }
            else if (message.pack) {
                const page = await packUrlExt(message.url, message.hide_tab);
                if (page.icon) {
                    bookmark.icon = page.icon
                    await backend.storeIcon(bookmark);
                }

                bookmark.name = page.title;

                await backend.updateBookmark(bookmark);

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

receiveExternal.scrapyardGetUuid = async (message, sender) => {
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
};

receiveExternal.scrapyardUpdateUuid = async (message, sender) => {
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
        message.icon = undefined;
        message.stored_icon = undefined;
    }
    else if (message.icon)
        await backend.storeIcon(node);

    if (message.hasOwnProperty("comments"))
        await backend.storeComments(node.id, message.comments);

    await backend.updateBookmark(node);

    if (message.refresh)
        send.nodesUpdated();
};

receiveExternal.scrapyardRemoveUuid = async (message, sender) => {
    if (!isAutomationAllowed(sender))
        throw new Error();

    const node = await backend.getNode(message.uuid, true);

    if (node)
        await backend.deleteNodes(node.id);

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

    const node = await backend.getNode(message.uuid, true);
    if (node)
        browseNode(node);
};
