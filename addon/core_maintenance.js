import {send, receive} from "./proxy.js";
import {
    isContentNode,
    NODE_TYPE_ARCHIVE,
    NODE_TYPE_BOOKMARK,
    NODE_TYPE_NOTES
} from "./storage.js";
import {cloudShelf} from "./plugin_cloud_shelf.js";
import {indexString, indexHTML} from "./utils_html.js";
import {Archive, Comments, Icon, Node, Notes} from "./storage_entities.js";
import {Database} from "./storage_database.js";
import {settings} from "./settings.js";

receive.getAddonIdbPath = async message => {
    let helper = await helperApp.probe();

    if (!helper)
        return;

    const addonId = browser.runtime.getURL("/").split("/")[2];

    return helperApp.fetchText(`/request/idb_path/${addonId}`)
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
                const archive = await Archive.get(node);

                if (archive && !archive.byte_length && archive.object) {
                    let text = await Archive.reify(archive);
                    if (text)
                        await Archive.storeIndex(node, indexHTML(text));
                }
            }

            if (node.has_notes) {
                const notes = await Notes.get(node);
                if (notes) {
                    delete notes.id;
                    await Notes.add(node, notes);
                }
            }

            if (node.has_comments) {
                const comments = await Comments.get(node);
                if (comments) {
                    const words = indexString(comments);
                    await Comments.storeIndex(node.id, words);
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
    if (!cloudShelf.isAuthenticated())
        return false;

    send.startProcessingIndication({noWait: true});

    await cloudShelf.reset();

    send.stopProcessingIndication();

    return true;
}

receive.resetScrapyard = async message => {
    send.startProcessingIndication({noWait: true});

    await Database.wipeEverything();
    await settings.last_sync_date(null);

    browser.runtime.reload();

    send.stopProcessingIndication();

    send.shelvesChanged({synchronize: false});
}

receive.computeStatistics = async message => {
    let items = 0;
    let bookmarks = 0;
    let archives = 0;
    let notes = 0
    let size = 0;

    send.startProcessingIndication();

    await Node.iterate(node => {
        if (isContentNode(node))
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
