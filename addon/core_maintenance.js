import {send, receive} from "./proxy.js";
import {
    isEndpoint,
    DEFAULT_SHELF_NAME,
    DEFAULT_SHELF_UUID,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_NOTES,
    NODE_TYPE_SHELF
} from "./storage.js";
import {computeSHA1} from "./utils.js";
import {cloudBackend} from "./backend_cloud_shelf.js";
import {nativeBackend} from "./backend_native.js";
import {parseHtml, fixDocumentEncoding, indexString, indexHTML} from "./utils_html.js";
import {Query} from "./storage_query.js";
import {Bookmark} from "./bookmarks_bookmark.js";
import {Archive, Comments, Icon, Node, Notes} from "./storage_entities.js";
import {ExportArea} from "./storage_export.js";
import {settings} from "./settings.js";

receive.getAddonIdbPath = async message => {
    let helperApp = await nativeBackend.probe();

    if (!helperApp)
        return;

    const addonId = browser.runtime.getURL("/").split("/")[2];

    return nativeBackend.fetchText(`/request/idb_path/${addonId}`)
};

receive.optimizeDatabase = async message => {
    const DEBUG = false;

    let fixDate = (node, key) => {
        if (!(node[key] instanceof Date)) {
            if (node[key]) {
                node[key] = new Date(node[key]);
                if (isNaN(node[key]))
                    node[key] = new Date(0);
            }
            else
                node[key] = new Date(0);
        }
    }

    send.startProcessingIndication({noWait: true});

    const defaultShelf = await Node.get(1);
    if (defaultShelf.type === NODE_TYPE_SHELF && defaultShelf.name === DEFAULT_SHELF_NAME
            && defaultShelf.uuid !== DEFAULT_SHELF_UUID) {
        defaultShelf.uuid = DEFAULT_SHELF_UUID;
        await Node.update(defaultShelf);
    }

    const nodeIDs = await Query.allNodeIDs();
    //const nodeIDs = await bookmarkManager.queryFullSubtree(1, true);
    let currentProgress = 0;
    let ctr = 0;

    for (let id of nodeIDs) {
        try {
            const node = await Node.get(id);
            let actionTaken = false;

            const bookmarkNode = node.type === NODE_TYPE_ARCHIVE || node.type === NODE_TYPE_BOOKMARK;
            if (bookmarkNode && node.icon && !node.stored_icon) {
                await Bookmark.storeIcon(node);

                if (DEBUG)
                    console.log("storing icon");

                if (!node.stored_icon) {
                    node.icon = undefined;

                    if (DEBUG)
                        console.log("nullified icon");
                }

                actionTaken = true;
            }
            else if (bookmarkNode && node.icon && node.stored_icon && !node.icon.startsWith("hash:")) {
                const icon = await Icon.get(node.id);
                if (icon)
                    node.icon = "hash:" + (await computeSHA1(icon));
                else {
                    node.icon = undefined;
                    node.stored_icon = undefined;
                }

                if (DEBUG)
                    console.log("hashing icon");

                actionTaken = true;
            }
            else if (!bookmarkNode) {
                node.icon = undefined;
                node.stored_icon = undefined;

                if (DEBUG)
                    console.log("deleted icon");

                actionTaken = true;
            }

            fixDate(node,"date_added");
            fixDate(node,"date_modified");

            Bookmark.clean(node);

            if (node.type === NODE_TYPE_ARCHIVE) {
                const blob = await Archive.get(node.id);

                if (blob) {
                    let content = await Archive.reify(blob);

                    if (!blob.type && typeof content === "string" && !blob.byte_length
                            || blob.type && blob.type.startsWith("text/html")) {
                        blob.type = "text/html";
                        const doc = parseHtml(content);
                        fixDocumentEncoding(doc);
                        content = doc.documentElement.outerHTML;
                    }

                    await Archive.delete(node.id);
                    await Archive.add(node.id, content, blob.type, blob.byte_length);
                    actionTaken = true;
                }
            }

            await Node.update(node);

            if (actionTaken) {
                if (DEBUG)
                    console.log("Processed: %s", node.name);
            }

            ctr += 1;
            const newProgress = Math.round((ctr / nodeIDs.length) * 100);
            if (newProgress !== currentProgress) {
                currentProgress = newProgress;
                send.databaseOptimizationProgress({progress: currentProgress});
            }
        }
        catch (e) {
            console.error(e);
        }
    }

    send.stopProcessingIndication();

    send.databaseOptimizationFinished();
};

receive.reindexArchiveContent = async message => {
    send.startProcessingIndication({noWait: true});

    const nodes = await Node.filter(n => n.type === NODE_TYPE_ARCHIVE || n.has_notes || n.has_comments);

    let currentProgress = 0;
    let ctr = 0;

    for (let node of nodes) {
        //console.log("Processing: %s", node.name)

        try {
            if (node.type === NODE_TYPE_ARCHIVE) {
                const blob = await Archive.get(node.id);

                if (blob && !blob.byte_length && blob.data && typeof blob.data === "string")
                    await Archive.updateIndex(node.id, indexHTML(blob.data));
                else if (blob && !blob.byte_length && blob.object) {
                    let text = await Archive.reify(blob);
                    if (text)
                        await Archive.updateIndex(node.id, indexHTML(text));
                }
            }

            if (node.has_notes) {
                const notes = await Notes.get(node.id);
                if (notes) {
                    delete notes.id;
                    await Notes.add(notes);
                }
            }

            if (node.has_comments) {
                const comments = await Comments.get(node.id);
                if (comments) {
                    const words = indexString(comments);
                    await Comments.updateIndex(node.id, words);
                }
            }

            ctr += 1;
            const newProgress = Math.round((ctr / nodes.length) * 100);
            if (newProgress !== currentProgress) {
                currentProgress = newProgress;
                send.indexUpdateProgress({progress: currentProgress});
            }
        } catch (e) {
            console.error(e);
        }
    }

    send.stopProcessingIndication();

    send.indexUpdateFinished();
};

receive.resetCloud = async message => {
    if (!cloudBackend.isAuthenticated())
        return false;

    send.startProcessingIndication({noWait: true});

    await cloudBackend.reset();

    send.stopProcessingIndication();

    return true;
}

receive.resetSync = async message => {
    if (!settings.sync_directory())
        return;

    const helperApp = nativeBackend.probe(true);

    if (helperApp) {
        send.startProcessingIndication({noWait: true});

        try {
            await nativeBackend.post("/sync/reset", {sync_directory: settings.sync_directory()});
            settings.sync_enabled(false);
            settings.last_sync_date(null);
            send.syncStateChanged({enabled: false});
        }
        finally {
            send.stopProcessingIndication();
        }
    }
}

receive.resetScrapyard = async message => {
    send.startProcessingIndication({noWait: true});

    await ExportArea.prepareToImportEverything();

    send.stopProcessingIndication();

    send.shelvesChanged();
}

receive.computeStatistics = async message => {
    let items = 0;
    let bookmarks = 0;
    let archives = 0;
    let notes = 0
    let size = 0;

    send.startProcessingIndication();

    await Node.iterate(node => {
        if (isEndpoint(node))
            items += 1;

        if (node.type === NODE_TYPE_BOOKMARK)
            bookmarks += 1;

        if (node.type === NODE_TYPE_ARCHIVE) {
            archives += 1;
            size += node.size || 0;
        }

        if (node.type === NODE_TYPE_NOTES) {
            notes += 1;
            size += node.size || 0;
        }
    });

    send.stopProcessingIndication();

    return {items, bookmarks, archives, notes, size};

}
