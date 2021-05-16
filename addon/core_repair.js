import {backend} from "./backend.js";
import {send} from "./proxy.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_NOTES} from "./storage_constants.js";
import {computeSHA1, stringByteLengthUTF8} from "./utils.js";
import {settings} from "./settings.js";
import {cloudBackend} from "./backend_cloud.js";
import {nativeBackend} from "./backend_native.js";
import {parseHtml, clearDocumentEncoding} from "./utils_html.js";

export async function getAddonIDBPath() {
    let helperApp = await nativeBackend.probe();

    if (!helperApp)
        return;

    const addonId = browser.runtime.getURL("/").split("/")[2];

    return nativeBackend.fetchText(`/request/idb_path/${addonId}`)
}

export async function reindexArchiveContent() {
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
        } catch (e) {
            console.error(e);
        }
    }

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

export async function optimizeDatabase() {
    const DEBUG = false;
    const nodeIDs = await backend.getNodeIds();
    //const nodeIDs = await backend.queryFullSubtree(1, true);

    send.startProcessingIndication();

    for (let id of nodeIDs) {
        try {
            const node = await backend.getNode(id);
            let actionTaken = false;

            if (node.icon && !node.stored_icon) {
                await backend.storeIcon(node);

                if (DEBUG)
                    console.log("storing icon");

                if (!node.stored_icon) {
                    node.icon = null;

                    if (DEBUG)
                        console.log("nullified icon");
                }

                actionTaken = true;
            }
            else if (node.icon && node.stored_icon && !node.icon.startsWith("hash:")) {
                const icon = await backend.fetchIcon(node.id);
                node.icon = "hash:" + (await computeSHA1(icon));

                if (DEBUG)
                    console.log("hashing icon");
                actionTaken = true;
            }

            if (node.type === NODE_TYPE_ARCHIVE) {
                const blob = await backend.fetchBlob(node.id);

                if (blob) {
                    let data = await backend.reifyBlob(blob);

                    if (!blob.type && typeof data === "string" && !blob.byte_length
                        || blob.type && blob.type.startsWith("text/html")) {
                        blob.type = "text/html";
                        const doc = parseHtml(data);
                        clearDocumentEncoding(doc);
                        $(doc.head).prepend("<meta charset=\"utf-8\">")
                        data = doc.documentElement.outerHTML;
                    }

                    await backend.deleteBlob(node.id);
                    await backend.storeBlobLowLevel(node.id, data, blob.type, blob.byte_length);
                    actionTaken = true;
                }
            }

            if (actionTaken) {
                await backend.updateNode(node);
                if (DEBUG)
                    console.log("Processed: %s", node.name);
            }
        }
        catch (e) {
            console.error(e);
        }
    }

    send.stopProcessingIndication();
}
