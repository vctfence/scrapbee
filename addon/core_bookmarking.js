import {formatBytes, getMimetypeByExt} from "./utils.js";
import {receive, send} from "./proxy.js";
import {
    ARCHIVE_TYPE_BYTES, ARCHIVE_TYPE_FILES,
    CLOUD_SHELF_ID,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_SHELF,
    UNDO_DELETE
} from "./storage.js";
import {getActiveTab, gettingStarted, showNotification, updateTabURL} from "./utils_browser.js";
import {HELPER_APP_v2_IS_REQUIRED, helperApp} from "./helper_app.js";
import {settings} from "./settings.js";
import {
    captureTab,
    finalizeCapture,
    isSpecialPage,
    notifySpecialPage,
    packUrlExt,
    showSiteCaptureOptions,
    performSiteCapture,
    startCrawling,
    abortCrawling,
    archiveBookmark
} from "./bookmarking.js";
import {fetchText} from "./utils_io.js";
import {TODO} from "./bookmarks_todo.js";
import {Folder} from "./bookmarks_folder.js";
import {Shelf} from "./bookmarks_shelf.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Archive, Node} from "./storage_entities.js";
import {undoManager} from "./bookmarks_undo.js";
import {browseNode} from "./browse.js";
import UUID from "./uuid.js";


receive.createShelf = message => Shelf.add(message.name);

receive.createFolder = message => Folder.add(message.parent, message.name);

receive.renameFolder = message => Folder.rename(message.id, message.name);

receive.addSeparator = message => Bookmark.addSeparator(message.parent_id);

receive.createBookmark = async message => {
    if (!settings.data_folder_path())
        return gettingStarted();

    const helper = await helperApp.hasVersion("2.0", HELPER_APP_v2_IS_REQUIRED);

    if (!helper)
        return;

    const node = message.node;

    if (isSpecialPage(node.uri))
        return notifySpecialPage();

    const addBookmark = () =>
        Bookmark.add(node, NODE_TYPE_BOOKMARK)
            .then(bookmark => {
                send.bookmarkAdded({node: bookmark});
                return bookmark;
            })
            .catch(e => {
                showNotification(e.message);
                send.bookmarkCreationFailed({node});
            });

    Bookmark.setTentativeId(node);
    node.type = NODE_TYPE_BOOKMARK; // needed for beforeBookmarkAdded
    return send.beforeBookmarkAdded({node})
        .then(addBookmark)
        .catch(addBookmark);
};

receive.updateBookmark = message => Bookmark.update(message.node);

receive.createArchive = async message => {
    if (!settings.data_folder_path())
        return gettingStarted();

    const helper = await helperApp.hasVersion("2.0", HELPER_APP_v2_IS_REQUIRED);

    if (!helper)
        return;

    const node = message.node;

    if (isSpecialPage(node.uri))
        return notifySpecialPage();

    let addBookmark = () =>
        Bookmark.idb.add(node, NODE_TYPE_ARCHIVE) // added to the storage on archive content update
            .then(bookmark => {
                getActiveTab().then(tab => {
                    bookmark.__tab_id = tab.id;
                    captureTab(tab, bookmark);
                    return bookmark;
                });
            });

    if (node.__crawl && !node.__site_capture) {
        getActiveTab().then(tab => {
            showSiteCaptureOptions(tab, node);
        });
        return;
    }

    Bookmark.setTentativeId(node);
    node.type = NODE_TYPE_ARCHIVE; // needed for beforeBookmarkAdded
    return send.beforeBookmarkAdded({node: node})
        .then(addBookmark)
        .catch(addBookmark);
};

receive.archiveBookmarks = async message => {
    const helper = await helperApp.hasVersion("2.0", HELPER_APP_v2_IS_REQUIRED);

    if (!helper)
        return;

    send.startProcessingIndication();

    try {
        for (const node of message.nodes) {
            if (node.type === NODE_TYPE_BOOKMARK)
                await archiveBookmark(node);
        }
    }
    finally {
        send.nodesUpdated();
        send.stopProcessingIndication();
    }
};

receive.updateArchive = message => Bookmark.updateArchive(message.uuid, message.data);

receive.setTODOState = message => TODO.setState(message.nodes);

receive.getBookmarkInfo = async message => {
    let node = await Node.getByUUID(message.uuid);
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

receive.copyNodes = async message => {
    const helper = await helperApp.hasVersion("2.0", HELPER_APP_v2_IS_REQUIRED);

    if (!helper)
        return;

    return Bookmark.copy(message.node_ids, message.dest_id, message.move_last);
};

receive.shareToCloud = async message => {
    const helper = await helperApp.hasVersion("2.0", HELPER_APP_v2_IS_REQUIRED);

    if (!helper)
        return;

    return Bookmark.copy(message.node_ids, CLOUD_SHELF_ID, true);
}

receive.moveNodes = async message => {
    const helper = await helperApp.hasVersion("2.0", HELPER_APP_v2_IS_REQUIRED);

    if (!helper)
        return;

    return Bookmark.move(message.node_ids, message.dest_id, message.move_last);
};

receive.deleteNodes = async message => {
    const helper = await helperApp.hasVersion("2.0", HELPER_APP_v2_IS_REQUIRED);

    if (!helper)
        return;

    return Bookmark.delete(message.node_ids);
};

receive.softDeleteNodes = async message => {
    const helper = await helperApp.hasVersion("2.0", HELPER_APP_v2_IS_REQUIRED);

    if (!helper)
        return;

    return Bookmark.softDelete(message.node_ids);
};

receive.reorderNodes = async message => {
    const helper = await helperApp.hasVersion("2.0", HELPER_APP_v2_IS_REQUIRED);

    if (!helper)
        return;

    return Bookmark.reorder(message.positions, message.posProperty);
};

receive.storePageHtml = message => {
    if (message.bookmark.__url_packing)
        return;

    return Bookmark.storeArchive(message.bookmark, message.html, "text/html", message.bookmark.__index)
        .then(() => {
            if (!message.bookmark.__mute_ui) {
                browser.tabs.sendMessage(message.bookmark.__tab_id, {type: "UNLOCK_DOCUMENT"});

                finalizeCapture(message.bookmark);

                if (message.bookmark.__crawl)
                    startCrawling(message.bookmark);
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
        const helper = await helperApp.hasVersion("0.4", `Scrapyard helper application v0.4+ is required for this feature.`);

        if (helper) {
            const fileUUID = UUID.numeric();
            await helperApp.post(`/serve/set_path/${fileUUID}`, {path: message.file_name});

            //const uuids = await helperApp.fetchJSON("/upload/open_file_dialog");
            const uuids = {[fileUUID]: message.file_name};

            for (const [uuid, file] of Object.entries(uuids)) {
                const url = helperApp.url(`/serve/file/${uuid}/`);
                const isHtml = /\.html?$/i.test(file);

                let bookmark = {uri: "", parent_id: message.parent_id};

                bookmark.name = file.replaceAll("\\", "/").split("/");
                bookmark.name = bookmark.name[bookmark.name.length - 1];

                let content;
                let contentType = getMimetypeByExt(file);

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
                        await Bookmark.storeArchive(bookmark, content, contentType);
                    else
                        throw new Error();
                } catch (e) {
                    console.error(e);
                    showNotification(`Can not upload ${bookmark.name}`);
                }

                await helperApp.fetch(`/serve/release_path/${uuid}`);
            }
            if (Object.entries(uuids).length)
                send.nodesUpdated();
        }
    }
    finally {
        send.stopProcessingIndication();
    }
}

receive.browseNode = async message => {
    return browseNode(message.node, message);
};

receive.browseNotes = message => {
    (message.tab
        ? updateTabURL(message.tab, "ui/notes.html#" + message.uuid, false)
        : browser.tabs.create({"url": "ui/notes.html#" + message.uuid}));
};

receive.browseOrgReference = message => {
    location.href = message.link;
};

receive.loadInternalResource = async message => {
    const url = browser.runtime.getURL(message.path);
    return await fetchText(url);
};

receive.abortRequested = message => {
    abortCrawling();
};

receive.replyFrameSiteCapture = (message, sender) => {
    browser.tabs.sendMessage(sender.tab.id, message);
};

receive.cancelSiteCapture = (message, sender) => {
    browser.tabs.sendMessage(sender.tab.id, message);
};

receive.continueSiteCapture = (message, sender) => {
    browser.tabs.sendMessage(sender.tab.id, message);
};

receive.performSiteCapture = (message, sender) => {
    performSiteCapture(message.bookmark);
};

receive.performUndo = async message => {
    send.startProcessingIndication();
    try {
        const result = await undoManager.undo();

        switch (result.operation) {
            case UNDO_DELETE:
                send.nodesImported({shelf: result.shelf});
            break;
        }
    }
    finally {
        send.stopProcessingIndication();
    }
};

receive.saveResource = async message => {
    return Archive.saveFile(message.node, message.filename, message.content);
};
