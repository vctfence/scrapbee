import {backend} from "./backend.js";
import {send} from "./proxy.js";
import {NODE_TYPE_ARCHIVE, NODE_TYPE_NOTES} from "./storage_constants.js";
import {stringByteLengthUTF8} from "./utils.js";
import {settings} from "./settings.js";
import {cloudBackend} from "./backend_cloud.js";

export async function recalculateArchiveSize() {
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
