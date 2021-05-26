import {backend} from "./backend.js";
import {send, receive} from "./proxy.js";
import {isEndpoint, NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK, NODE_TYPE_NOTES} from "./storage.js";
import {computeSHA1} from "./utils.js";
import {settings} from "./settings.js";
import {cloudBackend} from "./backend_cloud.js";
import {nativeBackend} from "./backend_native.js";
import {parseHtml, fixDocumentEncoding} from "./utils_html.js";

receive.getAddonIdbPath = async message => {
    let helperApp = await nativeBackend.probe();

    if (!helperApp)
        return;

    const addonId = browser.runtime.getURL("/").split("/")[2];

    return nativeBackend.fetchText(`/request/idb_path/${addonId}`)
};

receive.optimizeDatabase = async message => {
    const DEBUG = false;
    const nodeIDs = await backend.getNodeIds();
    //const nodeIDs = await backend.queryFullSubtree(1, true);

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

    let currentProgress = 0;
    let ctr = 0;

    for (let id of nodeIDs) {
        try {
            const node = await backend.getNode(id);
            let actionTaken = false;

            const bookmarkNode = node.type === NODE_TYPE_ARCHIVE || node.type === NODE_TYPE_BOOKMARK;
            if (bookmarkNode && node.icon && !node.stored_icon) {
                await backend.storeIcon(node);

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
                const icon = await backend.fetchIcon(node.id);
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

            backend.cleanBookmark(node);

            if (node.type === NODE_TYPE_ARCHIVE) {
                const blob = await backend.fetchBlob(node.id);

                if (blob) {
                    let content = await backend.reifyBlob(blob);

                    if (!blob.type && typeof content === "string" && !blob.byte_length
                            || blob.type && blob.type.startsWith("text/html")) {
                        blob.type = "text/html";
                        const doc = parseHtml(content);
                        fixDocumentEncoding(doc);
                        content = doc.documentElement.outerHTML;
                    }

                    await backend.deleteBlob(node.id);
                    await backend.storeBlobLowLevel(node.id, content, blob.type, blob.byte_length);
                    actionTaken = true;
                }
            }

            await backend.updateNode(node);

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

    const nodes = await backend.filterNodes(n => n.type === NODE_TYPE_ARCHIVE || n.has_notes || n.has_comments);

    let currentProgress = 0;
    let ctr = 0;

    for (let node of nodes) {
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

receive.computeStatistics = async message => {
    let items = 0;
    let bookmarks = 0;
    let archives = 0;
    let notes = 0
    let size = 0;

    send.startProcessingIndication();

    await backend.iterateNodes(node => {
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
