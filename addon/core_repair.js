import {backend} from "./backend.js";
import {send} from "./proxy.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_BOOKMARK} from "./storage_constants.js";
import {cleanObject, computeSHA1, formatBytes} from "./utils.js";
import {settings} from "./settings.js";
import {cloudBackend} from "./backend_cloud.js";
import {nativeBackend} from "./backend_native.js";
import {parseHtml, fixDocumentEncoding} from "./utils_html.js";

export async function getAddonIDBPath() {
    let helperApp = await nativeBackend.probe();

    if (!helperApp)
        return;

    const addonId = browser.runtime.getURL("/").split("/")[2];

    return nativeBackend.fetchText(`/request/idb_path/${addonId}`)
}

export async function optimizeDatabase() {
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

    send.startProcessingIndication();

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

            cleanObject(node, true);

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
        }
        catch (e) {
            console.error(e);
        }
        finally {
            ctr += 1;
            const newProgress = Math.round((ctr / nodeIDs.length) * 100);
            if (newProgress !== currentProgress) {
                currentProgress = newProgress;
                send.databaseOptimizationProgress({progress: currentProgress});
            }
        }
    }

    send.databaseOptimizationFinished();

    send.stopProcessingIndication();
}

export async function reindexArchiveContent() {
    send.startProcessingIndication();

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
        } catch (e) {
            console.error(e);
        }
        finally {
            ctr += 1;
            const newProgress = Math.round((ctr / nodes.length) * 100);
            if (newProgress !== currentProgress) {
                currentProgress = newProgress;
                send.indexUpdateProgress({progress: currentProgress});
            }
        }
    }

    send.indexUpdateFinished();

    send.stopProcessingIndication();
}

export async function resetCloud() {
    if (!cloudBackend.isAuthenticated())
        return false;

    send.startProcessingIndication();

    await cloudBackend.reset();

    send.stopProcessingIndication();

    return true;
}
