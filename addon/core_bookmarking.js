import {formatBytes, getMimetypeExt} from "./utils.js";
import {backend} from "./backend.js";
import {receive, send} from "./proxy.js";
import {CLOUD_SHELF_ID, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_SHELF} from "./storage.js";
import {getActiveTab, showNotification} from "./utils_browser.js";
import {nativeBackend} from "./backend_native.js";
import {settings} from "./settings.js";
import {browseNode, captureTab, isSpecialPage, notifySpecialPage, packUrlExt} from "./bookmarking.js";
import {parseHtml} from "./utils_html.js";
import {fetchText} from "./utils_io.js";
import {getFavicon} from "./favicon.js";

receive.createShelf = message => backend.createGroup(null, message.name, NODE_TYPE_SHELF);

receive.createGroup = message => backend.createGroup(message.parent, message.name);

receive.renameGroup = message => backend.renameGroup(message.id, message.name);

receive.addSeparator = message => backend.addSeparator(message.parent_id);

receive.createBookmark = message => {
    const options = message.data;

    if (isSpecialPage(options.uri)) {
        notifySpecialPage();
        return;
    }

    const addBookmark = () =>
        backend.addBookmark(options, NODE_TYPE_BOOKMARK)
            .then(bookmark => {
                send.bookmarkAdded({node: bookmark});
            });

    backend.setTentativeId(options);
    send.beforeBookmarkAdded({node: options})
        .then(addBookmark)
        .catch(addBookmark);
};

receive.createBookmarkFromURL = async message => {
    let options = {
        parent_id: message.parent_id,
        uri: message.url,
        name: "Untitled"
    };

    send.startProcessingIndication();

    try {
        const html = await fetchText(message.url);
        let doc;
        if (html)
            doc = parseHtml(html);

        if (doc) {
            const title = $("title", doc).text();
            if (title)
                options.name = title;

            const icon = await getFavicon(message.url, doc);
            if (icon)
                options.icon = icon;
        }
    }
    catch (e) {
        console.log(e);
    }

    const bookmark = await backend.addBookmark(options, NODE_TYPE_BOOKMARK);
    await send.stopProcessingIndication();
    send.bookmarkCreated({node: bookmark});
};

receive.updateBookmark = message => backend.updateBookmark(message.node);

receive.createArchive = message => {
    const options = message.data;

    if (isSpecialPage(options.uri)) {
        notifySpecialPage();
        return;
    }

    let addBookmark = () =>
        backend.addBookmark(options, NODE_TYPE_ARCHIVE)
            .then(bookmark => {
                getActiveTab().then(tab => {
                    bookmark.__tab_id = tab.id;
                    captureTab(tab, bookmark);
                });
            });

    backend.setTentativeId(options);
    send.beforeBookmarkAdded({node: options})
        .then(addBookmark)
        .catch(addBookmark);
};

receive.updateArchive = message => backend.updateBlob(message.id, message.data);

receive.setTODOState = message => backend.setTODOState(message.nodes);

receive.getBookmarkInfo = async message => {
    let node = await backend.getNode(message.id);
    node.__formatted_size = node.size ? formatBytes(node.size) : null;
    node.__formatted_date = node.date_added
        ? node.date_added.toString().replace(/:[^:]*$/, "")
        : null;
    return node;
};

receive.getHideToolbarSetting = async message => {
    await settings.load();
    return settings.do_not_show_archive_toolbar();
};

receive.copyNodes = message => {
    return backend.copyNodes(message.node_ids, message.dest_id, message.move_last);
};

receive.shareToCloud = message => {
    return backend.copyNodes(message.node_ids, CLOUD_SHELF_ID, true);
}

receive.moveNodes = message => {
    return backend.moveNodes(message.node_ids, message.dest_id, message.move_last);
};

receive.deleteNodes = message => {
    return backend.deleteNodes(message.node_ids);
};

receive.reorderNodes = message => {
    return backend.reorderNodes(message.positions);
};

receive.storePageHtml = message => {
    if (message.bookmark.__page_packing)
        return;

    backend.storeBlob(message.bookmark.id, message.data, "text/html")
        .then(() => {
            if (!message.bookmark.__mute_ui) {
                browser.tabs.sendMessage(message.bookmark.__tab_id, {type: "UNLOCK_DOCUMENT"});

                if (message.bookmark?.__automation && message.bookmark?.select)
                    send.bookmarkCreated({node: message.bookmark});
                else if (message.bookmark && !message.bookmark.__automation)
                    send.bookmarkAdded({node: message.bookmark});
            }
        })
        .catch(e => {
            console.error(e);
            if (!message.bookmark.__mute_ui) {
                chrome.tabs.sendMessage(message.bookmark.__tab_id, {type: "UNLOCK_DOCUMENT"});
                alertNotify("Error archiving page.");
            }
        });
};

receive.addNotes = message => backend.addNotes(message.parent_id, message.name);

receive.storeNotes = message => backend.storeNotes(message.options);

receive.uploadFiles = async message => {
    send.startProcessingIndication();

    try {
        if (await nativeBackend.hasVersion("0.4")) {
            const uuids = await nativeBackend.fetchJSON("/upload/open_file_dialog");

            for (const [uuid, file] of Object.entries(uuids)) {
                const url = nativeBackend.url(`/serve/file/${uuid}/`);
                const isHtml = /\.html?$/i.test(file);

                let bookmark = {uri: "", parent_id: message.parent_id};

                bookmark.name = file.replaceAll("\\", "/").split("/");
                bookmark.name = bookmark.name[bookmark.name.length - 1];

                let content;
                let contentType = getMimetypeExt(file);

                try {
                    if (isHtml) {
                        const page = await packUrlExt(url);
                        bookmark.name = page.title || bookmark.name;
                        bookmark.icon = page.icon;
                        content = page.html;
                    }
                    else {
                        const response = await fetch(url);
                        if (response.ok) {
                            contentType = response.headers.get("content-type") || contentType;
                            content = await response.arrayBuffer();
                        }
                    }

                    bookmark = await backend.addBookmark(bookmark, NODE_TYPE_ARCHIVE);
                    if (content)
                        await backend.storeBlob(bookmark.id, content, contentType);
                    else
                        throw new Error();
                } catch (e) {
                    console.error(e);
                    showNotification(`Can not upload ${bookmark.name}`);
                }

                await nativeBackend.fetch(`/serve/release_path/${uuid}`);
            }
            if (Object.entries(uuids).length)
                send.nodesUpdated();
        }
        else {
            showNotification(`Helper application v0.4+ is required for this feature.`);
        }
    }
    finally {
        send.stopProcessingIndication();
    }
}

receive.browseNode = message => {
    browseNode(message.node, message.tab, message.preserveHistory, message.container);
};

receive.browseNotes = message => {
    (message.tab
        ? browser.tabs.update(message.tab.id, {
            "url": "ui/notes.html#" + message.uuid + ":" + message.id,
            "loadReplace": true
        })
        : browser.tabs.create({"url": "ui/notes.html#" + message.uuid + ":" + message.id}));
};

receive.browseOrgReference = message => {
    location.href = message.link;
};
