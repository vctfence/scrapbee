import {formatBytes, getMimetypeExt} from "./utils.js";
import {receive, send} from "./proxy.js";
import {CLOUD_SHELF_ID, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_SHELF} from "./storage.js";
import {getActiveTab, showNotification} from "./utils_browser.js";
import {nativeBackend} from "./backend_native.js";
import {settings} from "./settings.js";
import {browseNode, captureTab, finalizeCapture, isSpecialPage, notifySpecialPage, packUrlExt} from "./bookmarking.js";
import {parseHtml} from "./utils_html.js";
import {fetchText} from "./utils_io.js";
import {getFavicon} from "./favicon.js";
import {TODO} from "./bookmarks_todo.js";
import {Group} from "./bookmarks_group.js";
import {Shelf} from "./bookmarks_shelf.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Node} from "./storage_entities.js";

receive.createShelf = message => Shelf.add(message.name);

receive.createGroup = message => Group.add(message.parent, message.name);

receive.renameGroup = message => Group.rename(message.id, message.name);

receive.addSeparator = message => Bookmark.addSeparator(message.parent_id);

receive.createBookmark = message => {
    const options = message.data;

    if (isSpecialPage(options.uri)) {
        notifySpecialPage();
        return;
    }

    const addBookmark = () =>
        Bookmark.add(options, NODE_TYPE_BOOKMARK)
            .then(bookmark => {
                send.bookmarkAdded({node: bookmark});
            });

    options.type = NODE_TYPE_BOOKMARK; // needed for beforeBookmarkAdded
    Bookmark.setTentativeId(options);
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

    if (!/^https?:\/\/.*/.exec(options.uri))
        options.uri = "http://" + options.uri;

    send.startProcessingIndication();

    try {
        const html = await fetchText(options.uri);
        let doc;
        if (html)
            doc = parseHtml(html);

        if (doc) {
            const title = $("title", doc).text();
            if (title)
                options.name = title;

            const icon = await getFavicon(options.uri, doc);
            if (icon)
                options.icon = icon;
        }
    }
    catch (e) {
        console.error(e);
    }

    const bookmark = await Bookmark.add(options, NODE_TYPE_BOOKMARK);
    await send.stopProcessingIndication();
    send.bookmarkCreated({node: bookmark});
};

receive.updateBookmark = message => Bookmark.update(message.node);

receive.createArchive = message => {
    const options = message.data;

    if (isSpecialPage(options.uri)) {
        notifySpecialPage();
        return;
    }

    let addBookmark = () =>
        Bookmark.add(options, NODE_TYPE_ARCHIVE)
            .then(bookmark => {
                getActiveTab().then(tab => {
                    bookmark.__tab_id = tab.id;
                    captureTab(tab, bookmark);
                });
            });

    options.type = NODE_TYPE_ARCHIVE; // needed for beforeBookmarkAdded
    Bookmark.setTentativeId(options);
    send.beforeBookmarkAdded({node: options})
        .then(addBookmark)
        .catch(addBookmark);
};

receive.updateArchive = message => Bookmark.updateArchive(message.id, message.data);

receive.setTODOState = message => TODO.setState(message.nodes);

receive.getBookmarkInfo = async message => {
    let node = await Node.get(message.id);
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
    return Bookmark.copy(message.node_ids, message.dest_id, message.move_last);
};

receive.shareToCloud = message => {
    return Bookmark.copy(message.node_ids, CLOUD_SHELF_ID, true);
}

receive.moveNodes = message => {
    return Bookmark.move(message.node_ids, message.dest_id, message.move_last);
};

receive.deleteNodes = message => {
    return Bookmark.delete(message.node_ids);
};

receive.reorderNodes = message => {
    return Bookmark.reorder(message.positions);
};

receive.storePageHtml = message => {
    if (message.bookmark.__page_packing)
        return;

    Bookmark.storeArchive(message.bookmark.id, message.data, "text/html")
        .then(() => {
            if (!message.bookmark.__mute_ui) {
                browser.tabs.sendMessage(message.bookmark.__tab_id, {type: "UNLOCK_DOCUMENT"});

                finalizeCapture(message.bookmark);
            }
        })
        .catch(e => {
            console.error(e);
            if (!message.bookmark.__mute_ui) {
                chrome.tabs.sendMessage(message.bookmark.__tab_id, {type: "UNLOCK_DOCUMENT"});
                showNotification("Error archiving page.");
            }
        });
};

receive.addNotes = message => Bookmark.addNotes(message.parent_id, message.name);

receive.storeNotes = message => Bookmark.storeNotes(message.options, message.property_change);

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

                    bookmark = await Bookmark.add(bookmark, NODE_TYPE_ARCHIVE);
                    if (content)
                        await Bookmark.storeArchive(bookmark.id, content, contentType);
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
            showNotification(`Scrapyard helper application v0.4+ is required for this feature.`);
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
