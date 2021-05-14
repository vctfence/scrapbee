import {backend} from "./backend.js";
import {browserBackend} from "./backend_browser.js";
import {cloudBackend} from "./backend_cloud.js";
import {nativeBackend} from "./backend_native.js";
import {ishellBackend} from "./backend_ishell.js";
import {settings} from "./settings.js";
import * as search from "./search.js";
import {send} from "./proxy.js";

import {
    exportOrg,
    exportJSON,
    importOrg,
    importJSON,
    importHtml,
    importRDF
} from "./import.js";

import {
    formatBytes, getMimetypeExt,
    stringByteLengthUTF8
} from "./utils.js";

import {
    CLOUD_SHELF_ID,
    DEFAULT_POSITION,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_NOTES,
    RDF_EXTERNAL_NAME,
    isSpecialShelf,
    EVERYTHING,
    DEFAULT_SHELF_ID,
    DEFAULT_SHELF_NAME,
    FIREFOX_BOOKMARK_MOBILE,
    NODE_TYPE_SHELF,
    NODE_TYPE_GROUP, FIREFOX_SHELF_NAME, FIREFOX_BOOKMARK_UNFILED, FIREFOX_BOOKMARK_MENU
} from "./storage_constants.js";
import UUID from "./lib/uuid.js";
import {readFile, ReadLine} from "./io.js";
import {getFaviconFromTab} from "./favicon.js";
import {getActiveTab, openContainerTab, showNotification} from "./utils_browser.js";


/* Internal message listener */
browser.runtime.onMessage.addListener(async (message, sender, sendResponse) => {

    switch (message.type) {

        case "CREATE_BOOKMARK":
            createBookmark(message.data);
            break;

        case "CREATE_ARCHIVE":
            createArchive(message.data);
            break;

        case "UPDATE_ARCHIVE":
            return backend.updateBlob(message.id, message.data);

        case "STORE_PAGE_HTML":
            storePageHtml(message);
            break;

        case "GET_BOOKMARK_INFO":
            let node = await backend.getNode(message.id);
            node.__formatted_size = node.size? formatBytes(node.size): null;
            node.__formatted_date = node.date_added
                ? node.date_added.toString().replace(/:[^:]*$/, "")
                : null;
            return node;

        case "GET_HIDE_TOOLBAR_SETTING":
            return settings.do_not_show_archive_toolbar();

        case "COPY_NODES":
            return backend.copyNodes(message.node_ids, message.dest_id);

        case "SHARE_TO_CLOUD":
            return backend.copyNodes(message.node_ids, CLOUD_SHELF_ID)
                .then(async newNodes => {
                    newNodes = newNodes.filter(n => message.node_ids.some(id => id === n.old_id));
                    for (let n of newNodes) {
                        n.pos = DEFAULT_POSITION;
                        await backend.updateNode(n);
                    }
                    await backend.updateExternalBookmarks(newNodes);
                });

        case "MOVE_NODES":
            return backend.moveNodes(message.node_ids, message.dest_id);

        case "DELETE_NODES":
            return backend.deleteNodes(message.node_ids);

        case "REORDER_NODES":
            return backend.reorderNodes(message.positions);

        case "BROWSE_NODE":
            browseNode(message.node, message.tab, message.preserveHistory, message.container);
            break;

        case "BROWSE_NOTES":
            (message.tab
                ? browser.tabs.update(message.tab.id, {
                    "url": "notes.html#" + message.uuid + ":" + message.id,
                    "loadReplace": true
                })
                : browser.tabs.create({"url": "notes.html#" + message.uuid + ":" + message.id}));
            break;

        case "BROWSE_ORG_REFERENCE":
            location.href = message.link;
            break;

        case "IMPORT_FILE":
            return importFile(message);

        case "EXPORT_FILE":
            return exportFile(message);

        case "LIST_BACKUPS":
            return listBackups(message);

        case "BACKUP_SHELF":
            return backupShelf(message);

        case "RESTORE_SHELF":
            return restoreShelf(message);

        case "DELETE_BACKUP":
            return deleteBackup(message);

        case "UI_LOCK_GET":
            browserBackend.getUILock();
            break;

        case "UI_LOCK_RELEASE":
            browserBackend.releaseUILock();
            break;

        case "GET_LISTENER_LOCK_STATE":
            return browserBackend.isListenerLocked();

        case "RECONCILE_BROWSER_BOOKMARK_DB":
            settings.load(s => {
                browserBackend.reconcileBrowserBookmarksDB();
            });
            break;
        case "RECONCILE_CLOUD_BOOKMARK_DB":
            settings.load(s => {
                cloudBackend.reconcileCloudBookmarksDB(message.verbose);
            });
            break;

        case "ENABLE_CLOUD_BACKGROUND_SYNC":
            settings.load(s => {
                startCloudBackgroundSync(s);
            });
            break;

        case "HELPER_APP_HAS_VERSION": {
            const helperApp = await nativeBackend.probe();

            if (helperApp && nativeBackend.hasVersion(message.version))
                return true;
        }
        break;

        case "GET_ADDON_IDB_PATH": {
            let helperApp = await nativeBackend.probe();

            if (!helperApp)
                return;

            const addonId = browser.runtime.getURL("/").split("/")[2];

            return nativeBackend.fetchText(`/request/idb_path/${addonId}`)
        }

        case "RECALCULATE_ARCHIVE_SIZE":
            return recalculateArchiveSize();

        case "REINDEX_ARCHIVE_CONTENT":
            return reindexArchiveContent();

        case "RESET_CLOUD":
            return resetCloud();
    }
});


/* External message listener */
browser.runtime.onMessageExternal.addListener(async (message, sender, sendResponse) => {

    sender.ishell = ishellBackend.isIShell(sender.id);

    switch (message.type) {
        case "SCRAPYARD_GET_VERSION":
            if (!isAutomationAllowed(sender))
                throw new Error();

            window.postMessage({type: "SCRAPYARD_ID_REQUESTED", sender}, "*");
            return browser.runtime.getManifest().version;

        case "SCRAPYARD_LIST_SHELVES":
            if (!sender.ishell)
                throw new Error();

            let shelves = await backend.listShelves();
            return shelves.map(n => ({name: n.name}));

        case "SCRAPYARD_LIST_GROUPS": {
            if (!sender.ishell)
                throw new Error();

            let shelves = await backend.listShelves();
            shelves = shelves.map(n => ({name: n.name}));

            let groups = await backend.listGroups();
            groups.forEach(n => renderPath(n, groups));
            groups = groups.map(n => ({name: n.name, path: n.path}));

            return [...shelves, ...groups];
        }

        case "SCRAPYARD_LIST_TAGS":
            if (!sender.ishell)
                throw new Error();

            let tags = await backend.queryTags();
            return tags.map(t => ({name: t.name.toLocaleLowerCase()}));

        case "SCRAPYARD_LIST_NODES":
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

        case "SCRAPYARD_ADD_BOOKMARK": {
            if (!isAutomationAllowed(sender))
                throw new Error();

            let activeTab = await getActiveTab();

            if (!message.uri)
                message.uri = message.url || activeTab.url;

            if (!message.uri || isSpecialPage(message.uri)) {
                notifySpecialPage();
                return;
            }

            if (!message.name)
                message.name = message.title || activeTab.title;

            message.type = NODE_TYPE_BOOKMARK;

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
                }
                catch (e) {
                    console.error(e);
                }
            }

            return backend.addBookmark(message, NODE_TYPE_BOOKMARK)
                .then(bookmark => {
                    if (message.__automation && message.select)
                        send.bookmarkCreated({node: bookmark});
                    else if (!message.__automation)
                        send.bookmarkAdded({node: bookmark});

                    return bookmark.uuid;
                });
        }
        case "SCRAPYARD_ADD_ARCHIVE": {
            if (!isAutomationAllowed(sender))
                throw new Error();

            let activeTab = await getActiveTab();

            if (message.url === "")
                message.uri = message.url;
            else if (!message.uri)
                message.uri = message.url || activeTab.url;

            if (message.uri === null || message.uri === undefined || isSpecialPage(message.uri)) {
                notifySpecialPage();
                return;
            }

            if (!message.name)
                message.name = message.title || activeTab.title;

            message.type = NODE_TYPE_ARCHIVE;

            if (message.icon === "")
                message.icon = null;
            else if (!message.icon)
                message.icon = await getFaviconFromTab(activeTab);

            if (!message.content_type)
                message.content_type = "text/html";

            const path = backend.expandPath(message.path);
            const group = await backend.getGroupByPath(path);
            message.parent_id = group.id;
            delete message.path;

            // by design, messages from iShell builtin Scrapyard commands always contain "search" parameter
            message.__automation = !(sender.ishell && message.search);

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

            if (!message.__automation) {
                try {
                    backend.setTentativeId(message);
                    await send.beforeBookmarkAdded({node: message});
                }
                catch (e) {
                    console.error(e);
                }
            }

            return backend.addBookmark(message, NODE_TYPE_ARCHIVE).then(async bookmark => {
                if (message.pack) {
                    return saveContent(bookmark, await packUrl(message.url, message.hide_tab));
                }
                else if (message.content) {
                    return saveContent(bookmark, message.content)
                }
                else {
                    Object.assign(bookmark, message);

                    let activeTab = await getActiveTab();
                    bookmark.__tab_id = activeTab.id;
                    captureTab(activeTab, bookmark);

                    return bookmark.uuid;
                }
            });
        }
        case "SCRAPYARD_GET_UUID": {
            if (!isAutomationAllowed(sender))
                throw new Error();

            const node = await backend.getNode(message.uuid, true);

            if (node) {
                return {
                    uuid: node.uuid,
                    title: node.name,
                    url: node.uri,
                    tags: node.tags,
                    details: node.details,
                    todo_state: node.todo_state,
                    todo_date: node.todo_date,
                    container: node.container
                }
            }
        }
            break;

        case "SCRAPYARD_UPDATE_UUID": {
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

            await backend.updateBookmark(node);

            if (message.refresh)
                send.nodesUpdated();

        }
            break;

        case "SCRAPYARD_REMOVE_UUID": {
            if (!isAutomationAllowed(sender))
                throw new Error();

            const node = await backend.getNode(message.uuid, true);

            if (node)
                await backend.deleteNodes(node.id);

            if (message.refresh)
                send.nodesUpdated();
        }
            break;

        case "SCRAPYARD_PACK_PAGE":
            if (!isAutomationAllowed(sender))
                throw new Error();

            return packUrl(message.url, message.hide_tab);

        case "SCRAPYARD_BROWSE_UUID": {
            if (!isAutomationAllowed(sender))
                throw new Error();

            const node = await backend.getNode(message.uuid, true);
            if (node)
                browseNode(node);
        }
            break;

        case "SCRAPYARD_BROWSE_NODE":
            if (!sender.ishell)
                throw new Error();

            if (message.node.uuid)
                backend.getNode(message.node.uuid, true).then(node => browseNode(node));
            else
                browseNode(message.node);

            break;
    }
});


// Bookmarking /////////////////////////////////////////////////////////////////////////////////////////////////////////

function createBookmark(data) {
    if (isSpecialPage(data.uri)) {
        notifySpecialPage();
        return;
    }

    const addBookmark = () =>
        backend.addBookmark(data, NODE_TYPE_BOOKMARK).then(bookmark => {
            send.bookmarkAdded({node: bookmark});
        });

    backend.setTentativeId(data);
    send.beforeBookmarkAdded({node: data})
        .then(addBookmark)
        .catch(addBookmark);
}

function createArchive(data) {
    if (isSpecialPage(data.uri)) {
        notifySpecialPage();
        return;
    }

    let addBookmark = () =>
        backend.addBookmark(data, NODE_TYPE_ARCHIVE)
            .then(bookmark => {
                getActiveTab().then(tab => {
                    bookmark.__tab_id = tab.id;
                    captureTab(tab, bookmark);
                });
            });

    backend.setTentativeId(data);
    send.beforeBookmarkAdded({node: data})
        .then(addBookmark)
        .catch(addBookmark);
}

export function isSpecialPage(url)
{
    return (url.substr(0,6) === "about:" || url.substr(0,7) === "chrome:"
        || url.substr(0,12) === "view-source:" || url.substr(0,14) === "moz-extension:"
        || url.substr(0,26) === "https://addons.mozilla.org" || url.substr(0,17) === "chrome-extension:"
        || url.substr(0,34) === "https://chrome.google.com/webstore");
}

export function notifySpecialPage() {
    showNotification("Scrapyard cannot be used with special pages:\n" +
        "about:, moz-extension:,\n" +
        "https://addons.mozilla.org,\n" +
        "chrome:, chrome-extension:,\n" +
        "https://chrome.google.com/webstore,\n" +
        "view-source:");
}

async function captureTab(tab, bookmark)
{
    if (isSpecialPage(tab.url)) {
        notifySpecialPage();
    }
    else {
        // Acquire selection html, if present

        let selection;
        let frames = await browser.webNavigation.getAllFrames({tabId: tab.id});

        for (let frame of frames) {
            try {
                await browser.tabs.executeScript(tab.id, {file: "/selection.js", frameId: frame.frameId});

                selection = await browser.tabs.sendMessage(tab.id, {type: "CAPTURE_SELECTION", options: bookmark});

                if (selection)
                    break;
            } catch (e) {
                console.error(e);
            }
        }

        let response;
        let initiateCapture = () => browser.tabs.sendMessage(tab.id, {
            type: "performAction",
            menuaction: 1,
            saveditems: 2,
            selection: selection,
            bookmark: bookmark,
            animate: settings.animate_capture_image()
        });

        try {
            response = await initiateCapture();
        } catch (e) {}

        if (typeof response == "undefined") { /* no response received - content script not loaded in active tab */
            let onScriptInitialized = async (message, sender) => {
                if (message.type === "CAPTURE_SCRIPT_INITIALIZED" && tab.id === sender.tab.id) {
                    browser.runtime.onMessage.removeListener(onScriptInitialized);

                    try {
                        response = await initiateCapture();
                    } catch (e) {
                        console.error(e)
                    }

                    if (typeof response == "undefined")
                        alertNotify("Cannot initialize capture script, please retry.");

                }
            };
            browser.runtime.onMessage.addListener(onScriptInitialized);

            try {
                try {
                    await browser.tabs.executeScript(tab.id, {file: "/savepage/content-frame.js", allFrames: true});
                } catch (e) {
                    console.error(e);
                }

                await browser.tabs.executeScript(tab.id, {file: "/savepage/content.js"});
            } catch (e) {
                // capture of binary files

                let xhr = new XMLHttpRequest();

                xhr.open("GET", tab.url, true);
                xhr.setRequestHeader("Cache-Control", "no-store");

                xhr.responseType = "arraybuffer";
                xhr.timeout = maxResourceTime * 1000;
                xhr.onerror = function (e) {
                    console.error(e)
                };
                xhr.onloadend = function () {
                    if (this.status === 200) {
                        let contentType = this.getResponseHeader("Content-Type");
                        if (contentType == null)
                            contentType = getMimetypeExt(tab.url) || "application/pdf";

                        backend.storeBlob(bookmark.id, this.response, contentType);

                        send.bookmarkAdded({node: bookmark});
                    }
                };

                xhr.send()
            }
        }
    }
}

export async function packPage(url, bookmark, initializer, resolver, hide_tab) {
    return new Promise(async (resolve, reject) => {
        let completionListener = function (message, sender, sendResponse) {
            if (message.type === "STORE_PAGE_HTML" && message.bookmark.__tab_id === packingTab.id) {
                browser.tabs.onUpdated.removeListener(listener);
                browser.runtime.onMessage.removeListener(completionListener);
                browser.tabs.remove(packingTab.id);

                resolve(resolver(message));
            }
        };

        browser.runtime.onMessage.addListener(completionListener);

        let listener = async (id, changed, tab) => {
            if (id === packingTab.id && changed.status === "complete") {

                let initializationListener = async function (message, sender, sendResponse) {
                    if (message.type === "CAPTURE_SCRIPT_INITIALIZED" && sender.tab.id === packingTab.id) {
                        browser.runtime.onMessage.removeListener(initializationListener);

                        await initializer(bookmark, tab);
                        bookmark.__tab_id = packingTab.id;

                        try {
                            await browser.tabs.sendMessage(packingTab.id, {
                                type: "performAction",
                                menuaction: 1,
                                saveditems: 2,
                                bookmark: bookmark
                            });
                        } catch (e) {
                            console.error(e);
                            reject(e);
                        }
                    }
                };

                browser.runtime.onMessage.addListener(initializationListener);

                try {
                    try {
                        await browser.tabs.executeScript(tab.id, {
                            file: "savepage/content-frame.js",
                            allFrames: true
                        });
                    } catch (e) {
                        console.error(e);
                    }

                    await browser.tabs.executeScript(packingTab.id, {file: "savepage/content.js"});
                } catch (e) {
                    reject(e);
                }
            }
        };

        browser.tabs.onUpdated.addListener(listener);

        var packingTab = await browser.tabs.create({url: url, active: false});

        if (hide_tab)
            browser.tabs.hide(packingTab.id)
    });
}

async function packUrl(url, hide_tab) {
    return packPage(url, {}, b => b.__page_packing = true, m => m.data, hide_tab);
}

function storePageHtml(message) {
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
            console.log(e);
            if (!message.bookmark.__mute_ui) {
                chrome.tabs.sendMessage(message.bookmark.__tab_id, {type: "UNLOCK_DOCUMENT"});
                alertNotify("Error archiving page.");
            }
        });
}

async function browseNode(node, external_tab, preserve_history, container) {

    switch (node.type) {
        case NODE_TYPE_BOOKMARK:
            let url = node.uri;
            if (url) {
                try {
                    new URL(url);
                }
                catch (e) {
                    url = "http://" + url;
                }

                container = container || node.container;

                return (external_tab
                    ? browser.tabs.update(external_tab.id, {"url": url, "loadReplace": !preserve_history})
                    : openContainerTab(url, container));
            }

            break;

        case NODE_TYPE_ARCHIVE:

            if (node.__tentative)
                return;

            if (node.external === RDF_EXTERNAL_NAME) {
                let helperApp = await nativeBackend.probe(true);

                if (!helperApp)
                    return;

                let url = nativeBackend.url(`/rdf/browse/${node.uuid}/_#${node.uuid}:${node.id}:${node.external_id}`);

                let rdf_tab = await (external_tab
                    ? browser.tabs.update(external_tab.id, {"url": url, "loadReplace": !preserve_history})
                    : browser.tabs.create({"url": url}));
                return;
            }

            return backend.fetchBlob(node.id).then(async blob => {
                if (blob) {
                    let objectURL = null;
                    let helperApp = false;

                    if (settings.browse_with_helper()) {
                        helperApp = await nativeBackend.probe(true);
                        if (helperApp)
                            objectURL = nativeBackend.url(`/browse/${node.uuid}`);
                    }

                    if (!objectURL) {
                        if (blob.data) { // legacy string content
                            let object = new Blob([await backend.reifyBlob(blob)],
                                {type: blob.type ? blob.type : "text/html"});
                            objectURL = URL.createObjectURL(object);
                        }
                        else
                            objectURL = URL.createObjectURL(blob.object);
                    }

                    let archiveURL = objectURL + "#" + node.uuid + ":" + node.id;

                    return (external_tab
                        ? browser.tabs.update(external_tab.id, {"url": archiveURL, "loadReplace": !preserve_history})
                        : browser.tabs.create({"url": archiveURL}))
                        .then(archive_tab => {

                            // Tab may be automatically reloaded if charset encoding is not found in first 1024 bytes
                            // A twisted logic is necessary to load the editor toolbar in this case
                            // This may happen if a large favicon is the first tag under the <head>
                            // Corrected version of page capture solves this problem by forcing encoding meta to be the first tag
                            // But for existing pages a workaround is necessary

                            let configureTab = async tab => {
                                browser.tabs.onUpdated.removeListener(listener)

                                await browser.tabs.insertCSS(tab.id, {file: "edit.css"});
                                await browser.tabs.executeScript(tab.id, {file: "lib/jquery.js"});
                                await browser.tabs.executeScript(tab.id, {file: "edit-content.js"});

                                if (!helperApp)
                                    URL.revokeObjectURL(objectURL);
                            };

                            let completed = false;
                            let retryTimeout;
                            let retries = 0;
                            let lastState;
                            let urlChanges = 0;

                            let checkStatus = tab => {
                                if (lastState === "complete") { // OK, the page is loaded, show toolbar
                                    configureTab(tab);
                                }
                                else if (lastState !== "complete" && retries < 3) { // Wait 3 more seconds
                                    retries += 1;
                                    retryTimeout = setTimeout(() => checkStatus(tab), 1000);
                                }
                                else {
                                    configureTab(tab); // Try to show the toolbar and remove the listener
                                }
                            };

                            var listener = async (id, changed, tab) => {
                                if (tab.id === archive_tab.id) {
                                    // Register first completed state, "loading" states will follow if the tab is reloaded
                                    if (!completed)
                                        completed = changed.status === "complete";

                                    // Register URL change events, there should be more than one if the tab is reloaded
                                    if (changed.url)
                                        urlChanges += 1;

                                    // This should work for the most of properly captured well-formed pages
                                    if (changed.status === "complete" && tab.title !== tab.url) {
                                        clearTimeout(retryTimeout);
                                        configureTab(tab);
                                    }
                                    // This should work for reloaded pages without <title> tag
                                    else if (changed.status === "complete" && urlChanges > 1) {
                                        clearTimeout(retryTimeout);
                                        configureTab(tab);
                                    }
                                    // This should work for non-reloaded pages without <title> tag
                                    else if (completed) {
                                        // Continue to register states
                                        lastState = changed.status;
                                        clearTimeout(retryTimeout);
                                        // When changes halted more than for one second, check if the last state is "complete"
                                        retryTimeout = setTimeout(() => checkStatus(tab), 1000);
                                    }
                                }
                            };

                            browser.tabs.onUpdated.addListener(listener);
                        });
                }
                else {
                    showNotification({message: "No data is stored."});
                }
            });

        case NODE_TYPE_NOTES:
            return (external_tab
                ? browser.tabs.update(external_tab.id, {"url": "notes.html#" + node.uuid + ":" + node.id,
                    "loadReplace": !preserve_history})
                : browser.tabs.create({"url": "notes.html#" + node.uuid + ":" + node.id}));
    }
}


// External routines ///////////////////////////////////////////////////////////////////////////////////////////////////

function isAutomationAllowed(sender) {
    const extension_whitelist = settings.extension_whitelist();

    return sender.ishell
        || (settings.enable_automation() && (!extension_whitelist
            || extension_whitelist.some(id => id.toLowerCase() === sender.id.toLowerCase())));
}

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

// Import/Export ///////////////////////////////////////////////////////////////////////////////////////////////////////

function importFile(message) {
    const shelf = isSpecialShelf(message.file_name)? message.file_name.toLocaleLowerCase(): message.file_name;

    let importf = ({
        "JSONL": async () => importJSON(shelf, new ReadLine(message.file)),
        "JSON": async () => importJSON(shelf, new ReadLine(message.file)),
        "ORG": async () => importOrg(shelf, await readFile(message.file)),
        "HTML": async () => importHtml(shelf, await readFile(message.file)),
        "RDF": async () => importRDF(shelf, message.file, message.threads, message.quick)
    })[message.file_ext.toUpperCase()];

    let invalidation_state = ishellBackend.isInvalidationEnabled();
    ishellBackend.enableInvalidation(false);
    return backend.importTransaction(importf).finally(() => {
        ishellBackend.enableInvalidation(invalidation_state);
        ishellBackend.invalidateCompletion();
    });
}

async function exportFile(message) {
    const shelf = isSpecialShelf(message.shelf)? message.shelf.toLocaleLowerCase(): message.shelf;

    let format = settings.export_format()? settings.export_format(): "json";

    let shallowExport = false;
    if (format === "org_shallow") {
        shallowExport = true;
        format = "org";
    }

    let exportf = format === "json" ? exportJSON : exportOrg;
    let file_name = shelf.replace(/[\\\/:*?"<>|\[\]()^#%&!@:+={}'~]/g, "_")
        + `.${format == "json" ? "jsonl" : format}`;

    let nodesRandom = await backend.getNodes(message.nodes.map(n => n.id));
    const nodes = [];

    for (const n of message.nodes) {
        const node = nodesRandom.find(nr => nr.id === n.id);
        Object.assign(node, n);
        nodes.push(node);
    }

    nodesRandom = null;

    if (settings.use_helper_app_for_export() && await nativeBackend.probe()) {
        // write to a temp file (much faster than IDB)

        try {
            nativeBackend.fetch("/export/initialize");
        } catch (e) {
            console.log(e);
        }

        const port = await nativeBackend.getPort();

        const file = {
            append: async function (text) {
                port.postMessage({
                    type: "EXPORT_PUSH_TEXT",
                    text: text
                })
            }
        };

        await new Promise(resolve => setTimeout(resolve, 50));

        await exportf(file, nodes, message.shelf, message.uuid, shallowExport);

        port.postMessage({
            type: "EXPORT_FINISH"
        });

        let url = nativeBackend.url("/export/download");
        let download;

        try {
            download = await browser.downloads.download({url: url, filename: file_name, saveAs: true});
        } catch (e) {
            console.error(e);
            nativeBackend.fetch("/export/finalize");
        }

        if (download) {
            let download_listener = delta => {
                if (delta.id === download) {
                    if (delta.state && delta.state.current === "complete" || delta.error) {
                        browser.downloads.onChanged.removeListener(download_listener);
                        nativeBackend.fetch("/export/finalize");
                    }
                }
            };
            browser.downloads.onChanged.addListener(download_listener);
        }
    }
    else {
        // store intermediate export results to IDB

        const MAX_BLOB_SIZE = 1024 * 1024 * 20; // ~40 mb of UTF-16
        const processId = UUID.numeric();

        let file = {
            content: [],
            size: 0,
            append: async function (text) {
                this.content.push(text);
                this.size += text.length;

                if (this.size >= MAX_BLOB_SIZE) {
                    await backend.exportPutBlob(processId, new Blob(this.content, {type: "text/plain"}));
                    this.content = [];
                    this.size = 0;
                }
            },
            flush: async function () {
                if (this.size && this.content.length)
                    await backend.exportPutBlob(processId, new Blob(this.content, {type: "text/plain"}));
            }
        };

        await exportf(file, nodes, message.shelf, message.uuid, shallowExport);
        await file.flush();

        let blob = new Blob(await backend.exportGetBlobs(processId), {type: "text/plain"});
        let url = URL.createObjectURL(blob);
        let download;

        try {
            download = await browser.downloads.download({url: url, filename: file_name, saveAs: true});
        } catch (e) {
            console.error(e);
            backend.exportCleanBlobs(processId);
        }

        if (download) {
            let download_listener = delta => {
                if (delta.id === download) {
                    if (delta.state && delta.state.current === "complete" || delta.error) {
                        browser.downloads.onChanged.removeListener(download_listener);
                        URL.revokeObjectURL(url);
                        backend.exportCleanBlobs(processId);
                    }
                }
            };
            browser.downloads.onChanged.addListener(download_listener);
        }
    }
}


// Backup //////////////////////////////////////////////////////////////////////////////////////////////////////////////

function listBackups(message) {
    let form = new FormData();
    form.append("directory", message.directory);

    return nativeBackend.fetchJSON(`/backup/list`, {method: "POST", body: form});
}

async function backupShelf(message) {
    const everything = message.shelf.toLowerCase() === EVERYTHING;
    let shelf, shelfName, shelfUUID;

    if (everything) {
        shelfUUID = shelfName = EVERYTHING;
    }
    else {
        shelf = await backend.queryShelf(message.shelf);
        shelfUUID = shelf.uuid;
        shelfName = shelf.name;
    }

    let nodes;

    if (everything) {
        const shelves = await backend.queryShelf();
        const cloud = shelves.find(s => s.id === CLOUD_SHELF_ID);
        if (cloud)
            shelves.splice(shelves.indexOf(cloud), 1);
        nodes = await backend.queryFullSubtree(shelves.map(s => s.id), false, true);
    }
    else {
        nodes = await backend.queryFullSubtree(shelf.id, false, true);
        nodes.shift();
    }

    const mobileBookmarks = nodes.find(n => n.external_id === FIREFOX_BOOKMARK_MOBILE);
    if (mobileBookmarks) {
        const mobileSubtree = nodes.filter(n => n.parent_id === mobileBookmarks.id);
        for (const n of mobileSubtree)
            nodes.splice(nodes.indexOf(n), 1);
        nodes.splice(nodes.indexOf(mobileBookmarks), 1);
    }

    let backupFile = `${UUID.date()}_${shelfUUID}.jsonl`

    const process = nativeBackend.post("/backup/initialize", {
        directory: message.directory,
        file: backupFile,
        compress: message.compress,
        method: message.method,
        level: message.level
    });

    const port = await nativeBackend.getPort();

    const file = {
        append: async function (text) {
            port.postMessage({
                type: "BACKUP_PUSH_TEXT",
                text: text
            })
        }
    };

    await new Promise(resolve => setTimeout(resolve, 50));

    await exportJSON(file, nodes, shelfName, shelfUUID, false, message.comment, true);

    port.postMessage({
        type: "BACKUP_FINISH"
    });

    await process;
}

async function restoreShelf(message) {
    send.startProcessingIndication();

    let error;

    try {
        await nativeBackend.post("/restore/initialize", {
            directory: message.directory,
            file: message.meta.file
        });

        const Reader = class {
            async* lines() {
                let line;
                while (line = await nativeBackend.fetchText("/restore/get_line"))
                    yield line;
            }
        };

        const shelfName = message.new_shelf? message.meta.alt_name: message.meta.name;
        const shelf = await importJSON(shelfName, new Reader(), true);

        await nativeBackend.fetch("/restore/finalize");

        send.nodesImported({shelf});

    } catch (e) {
        error = e;
    }

    send.stopProcessingIndication();

    if (error)
        throw error;
}

async function deleteBackup(message) {
    send.startProcessingIndication();

    try {
        await nativeBackend.post("/backup/delete", {
            directory: message.directory,
            file: message.meta.file
        });
    } catch (e) {
        console.log(e);
        return false;
    }

    send.stopProcessingIndication();
    return true;
}


// Repair /////////////////////////////////////////////////////////////////////////////////////////////////////////////

async function recalculateArchiveSize() {
    const nodeIDs = await backend.getNodeIds();

    send.startProcessingIndication();

    for (let id of nodeIDs) {
        const node = await backend.getNode(id);

        if (node.type === NODE_TYPE_ARCHIVE) {
            const blob = await backend.fetchBlob(node.id);

            if (blob && blob.data) {
                if (blob.byte_length)
                    node.size = blob.byte_length;
                else
                    node.size = stringByteLengthUTF8(blob.data);

                await backend.updateNode(node);
            }
            else if (blob && blob.object) {
                node.size = blob.object.size;
                await backend.updateNode(node);
            }
        }
        else if (node.type === NODE_TYPE_NOTES && node.has_notes) {
            const notes = await backend.fetchNotes(node.id);

            if (notes) {
                node.size = stringByteLengthUTF8(notes.content);
                if (notes.format === "delta")
                    node.size += stringByteLengthUTF8(notes.html);
            }

            await backend.updateNode(node);
        }
    }

    settings.archve_size_repaired(true);

    send.stopProcessingIndication();
}

async function reindexArchiveContent() {
    const nodeIDs = await backend.getNodeIds();

    send.startProcessingIndication();

    for (let id of nodeIDs) {
        const node = await backend.getNode(id);

        //console.log("Processing: %s", node.name)

        try {
            if (node.type === NODE_TYPE_ARCHIVE) {
                const blob = await backend.fetchBlob(node.id);

                if (blob && !blob.byte_length && blob.data && blob.data.indexWords)
                    await backend.updateIndex(node.id, blob.data.indexWords());
                else if (blob && !blob.byte_length && blob.object) {
                    let text = await backend.reifyBlob(blob);
                    await backend.updateIndex(node.id, text?.indexWords());
                }
            }

            if (node.has_notes) {
                const notes = await backend.fetchNotes(node.id);
                if (notes) {
                    delete notes.id;
                    await backend.storeNotesLowLevel(notes);
                }
            }

            if (node.has_comments) {
                const comments = await backend.fetchComments(node.id);
                if (comments) {
                    const words = comments.indexWords(false);
                    await backend.updateCommentIndex(node.id, words);
                }
            }
        }
        catch (e) {
            console.error(e);
        }
    }

    send.stopProcessingIndication();
}

async function resetCloud() {
    if (!cloudBackend.isAuthenticated())
        return false;

    send.startProcessingIndication();

    await cloudBackend.reset();

    send.stopProcessingIndication();

    return true;
}

// Initialization //////////////////////////////////////////////////////////////////////////////////////////////////////

function startCloudBackgroundSync(s) {
    if (s.cloud_background_sync())
        window._backgroundSyncInterval = setInterval(
            () => cloudBackend.reconcileCloudBookmarksDB(),
            15 * 60 * 1000);
    else
        if (window._backgroundSyncInterval)
            clearInterval(window._backgroundSyncInterval);
}

settings.load(async settings => {
    navigator.storage.persist().then(async function(persistent) {
        if (persistent) {
            await browserBackend.reconcileBrowserBookmarksDB();
            startCloudBackgroundSync(settings);
        } else
            console.log("Scrapyard was denied persistent storage permissions");
    });
});

search.initializeOmnibox();



console.log("==> background.js loaded");
