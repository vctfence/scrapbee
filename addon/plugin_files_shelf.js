import {
    FILES_EXTERNAL_TYPE,
    FILES_SHELF_ID,
    FILES_SHELF_NAME,
    FILES_SHELF_UUID,
    NODE_TYPE_SHELF,
    NODE_TYPE_FOLDER,
    NODE_TYPE_NOTES,
    FILES_EXTERNAL_ROOT_PREFIX, CLOUD_EXTERNAL_TYPE
} from "./storage.js";
import {Node, Notes} from "./storage_entities.js";
import {send} from "./proxy.js";
import {helperApp} from "./helper_app.js";
import {showNotification} from "./utils_browser.js";
import UUID from "./uuid.js";
import {Path} from "./path.js";
import {Folder} from "./bookmarks_folder.js";
import {Query} from "./storage_query.js";
import {settings} from "./settings.js";
import {browseNode} from "./browse.js";
import {ExternalNode} from "./storage_node_external.js";
import {ProgressCounter} from "./utils.js";

const FILES_ITEM_TYPE_FILE = "file";

export class FilesShelfPlugin {
    newFilesRootNode() {
        return {
            id: FILES_SHELF_ID,
            pos: -3,
            name: FILES_SHELF_NAME,
            uuid: FILES_SHELF_UUID,
            type: NODE_TYPE_SHELF,
            external: FILES_EXTERNAL_TYPE,
            external_id: FILES_SHELF_UUID
        };
    }

    async createFilesShelf() {
        const node = this.newFilesRootNode();
        Node.resetDates(node);
        return Node.idb.import(node);
    }

    async createIfMissing() {
        if (!await Node.get(FILES_SHELF_ID))
            return this.createFilesShelf();
    }

    async enable(state) {
        if (state) {
            await this.createIfMissing();
            send.shelvesChanged();
        }
        else {
            const nodes = await Query.fullSubtree(FILES_SHELF_ID);
            await Node.delete(nodes);
            send.shelvesChanged();
        }
    }

    async addDirectory(options) {
        send.startProcessingIndication({noWait: true});

        try {
            await this.#addDirectory(options);
        }
        finally {
            send.stopProcessingIndication();
        }
    }

    async #addDirectory(options) {
        options.path = options.path.replace("\\", "/");
        const response = await helperApp.fetchJSON_postJSON("/files/list_directory", {
            path: options.path,
            file_mask: options.file_mask
        });

        if (response?.status === "success") {
            await this.#populateFilesRoot(options, response.content);
        }
        else if (response?.status === "error") {
            if (response.error === "incorrect_path")
                showNotification("Incorrect directory path.");
        }
    }

    async #populateFilesRoot(options, files) {
        const root = await this.#createOrgRoot(options);
        const fileNodes = [];

        root.details = JSON.stringify({file_mask: options.file_mask});
        await Node.update(root);

        for (const file of files)
            if (file.type === FILES_ITEM_TYPE_FILE) {
                const node = await this.#createExternalFileNode(options, file);
                fileNodes.push(node);
            }

        await send.externalNodesReady();

        return this.#createSearchIndex(fileNodes);
    }

    async #createExternalFileNode(options, item) {
        const node = {
            name: item.name,
            type: NODE_TYPE_NOTES,
            external: FILES_EXTERNAL_TYPE,
            external_id: item.full_path,
            content_modified: new Date(item.content_modified),
            has_notes: true
        };

        const rootPath = FILES_SHELF_NAME + "/" + options.title;
        const scrapyardPath = rootPath + "/" + item.path.replace(/[^/]+$/, "");
        const folder = await Folder.getOrCreateByPath(scrapyardPath);

        await this.#setExternalForPath(folder, rootPath, options);
        node.parent_id = folder.id;
        return await Node.add(node);
    }

    async #createOrgRoot(options) {
        const folder = {
            name: options.title,
            uri: options.path,
            type: NODE_TYPE_FOLDER,
            parent_id: FILES_SHELF_ID,
            external: FILES_EXTERNAL_TYPE,
            external_id: FILES_EXTERNAL_ROOT_PREFIX + UUID.numeric()
        };

        return Node.add(folder);
    }

    async #setExternalForPath(folderNode, rootPath, options) {
        if (!folderNode.external_id) {
            const ascendants = await Query.ascendantIdsOf(folderNode.id);
            ascendants.push(folderNode.id);

            for (const ascendantId of ascendants) {
                const ascendant = await Node.get(ascendantId)

                if (!ascendant.external_id) {
                    const scrapyardPath = await Path.asString(ascendant);
                    const folderPath = scrapyardPath.replace(rootPath, "");
                    const diskPath = options.path + folderPath + "/" + ascendant.name;
                    ascendant.external_id = diskPath.replace("//", "/");

                    await Node.update(ascendant);
                }
            }
        }
    }

    async openWithEditor(node) {
        if (settings.files_editor_executable()) {
            return helperApp.postJSON("/files/open_with_editor", {
                path: node.external_id,
                editor: settings.files_editor_executable()
            });
        }
        else
            showNotification("Please specify the editor in the add-on settings.");
    }

    openExternalLink(link, node) {
        if (link.startsWith("wiki:"))
            return this.#openWikiLink(link, node);
        if (link.startsWith("wiki-asset-sys:"))
            return this.#openWikiAssetLink(link, node);
        if (link.startsWith("file:"))
            return this.#openFileLink(link, node);
    }

    async #openWikiLink(link, node) {
        const ascendants = await Query.ascendantIdsOf(node.id);
        const rootId = ascendants.at(-2);

        if (rootId) {
            const wikiNodes = await Query.fullSubtree(rootId);
            const topic = link.replace(/^wiki:/i, "");
            const topicNode = wikiNodes.find(n => n.name.replace(/\.org$/i, "") === topic);

            return browseNode(topicNode);
        }
    }

    async #openWikiAssetLink(link, node) {
        const ascendants = await Query.ascendantIdsOf(node.id);
        const rootId = ascendants.at(-2);

        if (rootId) {
            const filesRoot = await Node.get();
            const assetPath = link.replace(/^wiki-asset-sys:/i, "").replace(";", "/");
            const fullPath = filesRoot.uri + "/" + assetPath;

            return helperApp.postJSON("/files/shell_open_asset", {
                path: fullPath
            });
        }
    }

    async #openFileLink(link, node) {
        const ascendants = await Query.ascendantIdsOf(node.id);
        const filesRoot = await Node.get(ascendants.at(-2));
        const assetPath = link.replace(/^file:\/\/\/?/i, "");
        const fullPath = filesRoot.uri + "/" + assetPath;

        return helperApp.postJSON("/files/shell_open_asset", {
            path: fullPath
        });
    }

    async reconcileExternalFiles() {
        send.startProcessingIndication({noWait: true});

        try {
            await this.#reconcileExternalFiles();
        }
        finally {
            send.stopProcessingIndication();
        }
    }

    async #reconcileExternalFiles() {
        const existingFiles = [FILES_SHELF_UUID];
        const itemsToIndex = [];
        const filesRoots = [];

        await Query.selectDirectChildrenIdsOf(FILES_SHELF_ID, filesRoots);

        for (const rootId of filesRoots) {
            const fileNodes = await Query.fullSubtree(rootId);
            const filesRoot = fileNodes.find(n => n.external_id.startsWith(FILES_EXTERNAL_ROOT_PREFIX));
            const details = JSON.parse(filesRoot.details);
            const options = {title: filesRoot.name, path: filesRoot.external_id, file_mask: details.file_mask};
            const files = await this.#listDirectoryFiles(filesRoot.uri, options.file_mask);

            existingFiles.push(filesRoot.external_id);

            for (const file of files) {
                const existingFileNode = fileNodes.find(n => n.external_id === file.full_path);

                existingFiles.push(file.full_path);

                if (file.type === FILES_ITEM_TYPE_FILE && !existingFileNode) {
                    const node = await this.#createExternalFileNode(options, file);
                    itemsToIndex.push(node);
                }
                else if (file.type === FILES_ITEM_TYPE_FILE
                            && existingFileNode.content_modified.getTime() < file.content_modified) {
                    itemsToIndex.push(existingFileNode);

                    existingFileNode.content_modified = new Date(file.content_modified);
                    await Node.update(existingFileNode);
                }
            }
        }

        await this.#createSearchIndex(itemsToIndex);
        await ExternalNode.deleteMissingIn(existingFiles, FILES_EXTERNAL_TYPE);
        send.externalNodesReady();
    }

    async #listDirectoryFiles(path, fileMask) {
        let result = [];

        try {
            const response = await helperApp.fetchJSON_postJSON("/files/list_directory", {
                path,
                file_mask: fileMask
            });

            if (response?.status === "success") {
                result = response.content;
            }
        } catch (e) {
            console.error(e);
        }

        return result;
    }

    async #createSearchIndex(nodes) {
        const progressCounter = new ProgressCounter(nodes.length, "syncProgress");

        for (const node of nodes) {
            try {
                const words = await helperApp.fetchJSON_postJSON("/files/create_index", {
                    path: node.external_id
                });

                await Notes.storeIndex(node, words);
            } catch (e) {
                console.error(e);
            }

            progressCounter.incrementAndNotify();
        }
    }

    async beforeBookmarkCopied(dest, node) {
        if (dest.external !== FILES_EXTERNAL_TYPE && node.external === FILES_EXTERNAL_TYPE) {
            if (dest.external)
                node.external = dest.external;
            else
                delete node.external;
            delete node.external_id;
        }
    }
}

export const filesShelf = new FilesShelfPlugin();