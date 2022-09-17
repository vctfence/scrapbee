import {CloudStorage} from "./cloud_node_db.js";

const OBJECT_DIRECTORY = "objects";
const ICON_OBJECT_FILE = "icon.json";
const ARCHIVE_INDEX_OBJECT_FILE = "archive_index.json";
const ARCHIVE_OBJECT_FILE = "archive.json";
const ARCHIVE_CONTENT_FILE = "archive_content.blob";
const NOTES_INDEX_OBJECT_FILE = "notes_index.json";
const NOTES_OBJECT_FILE = "notes.json";
const COMMENTS_INDEX_OBJECT_FILE = "comments_index.json";
const COMMENTS_OBJECT_FILE = "comments.json";

export class CloudError {
    constructor(message) {
        this.message = message;
    }
}

export class CloudItemNotFoundError extends CloudError {
}

export class CloudClientBase {
    static CLOUD_SHELF_PATH = "/Cloud";
    static CLOUD_SHELF_INDEX = "cloud.jsbk";
    static REDIRECT_URL = "https://gchristensen.github.io/scrapyard/";

    constructor() {
        this._assetMethods = this._createAssetMethods();
    }

    get assets() {
        return this._assetMethods;
    }

    async authenticate() {
        return new Promise(async (resolve, reject) => {
            if (this.isAuthenticated())
                resolve(true);
            else {
                try {
                    let authTab = await browser.tabs.create({url: await this._getAuthorizationUrl()});

                    let listener = async (id, changed, tab) => {
                        if (id === authTab.id && changed.url?.startsWith(CloudClientBase.REDIRECT_URL)) {
                            await browser.tabs.onUpdated.removeListener(listener);
                            browser.tabs.remove(authTab.id);

                            if (changed.url.includes("code=")) {
                                try {
                                    await this._obtainRefreshToken(changed.url);
                                    resolve(true);
                                } catch (e) {
                                    console.error(e);
                                    resolve(false);
                                }
                            }
                            else
                                resolve(false);
                        }
                    };

                    browser.tabs.onUpdated.addListener(listener);
                } catch (e) {
                    console.error(e);
                    resolve(false);
                }
            }
        });
    }

    _getObjectDirectory(uuid) {
        return `${CloudClientBase.CLOUD_SHELF_PATH}/${OBJECT_DIRECTORY}/${uuid}`;
    }

    _getAssetPath(uuid, asset) {
        return `${CloudClientBase.CLOUD_SHELF_PATH}/${OBJECT_DIRECTORY}/${uuid}/${asset}`;
    }

    _createAssetMethods() {
        const storeAsset = asset => {
            return async (uuid, data) => {
                try {
                    const path = this._getAssetPath(uuid, asset);
                    await this.uploadFile(path, data);
                } catch (e) {
                    console.error(e);
                }
            };
        }

        const storeFile = async (uuid, data, file) => {
            try {
                const path = this._getAssetPath(uuid, file);
                await this.uploadFile(path, data);
            } catch (e) {
                console.error(e);
            }
        };

        const fetchAsset = (asset, binary) => {
            return async (uuid) => {
                try {
                    const path = this._getAssetPath(uuid, asset);
                    return await this.downloadFile(path, binary);
                }
                catch (e) {
                    console.error(e);
                }
            };
        }

        const fetchBinaryAsset = (asset, binary) => fetchAsset(asset, true);

        let methods = {};

        methods.storeNotes = storeAsset(NOTES_OBJECT_FILE);
        methods.fetchNotes = fetchAsset(NOTES_OBJECT_FILE);
        methods.storeNotesIndex = storeAsset(NOTES_INDEX_OBJECT_FILE);
        methods.fetchNotesIndex = fetchAsset(NOTES_INDEX_OBJECT_FILE);

        methods.storeArchiveObject = storeAsset(ARCHIVE_OBJECT_FILE);
        methods.fetchArchiveObject = fetchAsset(ARCHIVE_OBJECT_FILE);
        methods.storeArchiveContent = storeAsset(ARCHIVE_CONTENT_FILE);
        methods.storeArchiveFile = storeFile;
        methods.fetchArchiveContent = fetchBinaryAsset(ARCHIVE_CONTENT_FILE);
        methods.storeArchiveIndex = storeAsset(ARCHIVE_INDEX_OBJECT_FILE);
        methods.fetchArchiveIndex = fetchAsset(ARCHIVE_INDEX_OBJECT_FILE);

        methods.storeIcon = storeAsset(ICON_OBJECT_FILE);
        methods.fetchIcon = fetchAsset(ICON_OBJECT_FILE);

        methods.storeComments = storeAsset(COMMENTS_OBJECT_FILE);
        methods.fetchComments = fetchAsset(COMMENTS_OBJECT_FILE);
        methods.storeCommentsIndex = storeAsset(COMMENTS_INDEX_OBJECT_FILE);
        methods.fetchCommentsIndex = fetchAsset(COMMENTS_INDEX_OBJECT_FILE);

        return methods;
    }

    async deleteAssets(uuids) {
        for (const uuid of uuids) {
            try {
                const path = this._getObjectDirectory(uuid);
                await this.deleteFile(path);
            } catch (e) {
                console.error(e);
            }
        }
    }

    async downloadDB() {
        let storage = null;

        try {
            const path = `${CloudClientBase.CLOUD_SHELF_PATH}/${CloudClientBase.CLOUD_SHELF_INDEX}`;
            const content = await this.downloadFile(path);
            storage = CloudStorage.deserialize(content);
        }
        catch (e) {
            if (e instanceof CloudItemNotFoundError) {
                storage = new CloudStorage();
            }
            else if (e instanceof CloudError)
                throw e;
        }

        if (storage)
            Object.assign(storage, this._assetMethods);

        return storage;
    }

    async persistDB(db) {
        const path = `${CloudClientBase.CLOUD_SHELF_PATH}/${CloudClientBase.CLOUD_SHELF_INDEX}`;
        const content = db.serialize();
        this.uploadFile(path, content);
    }

    _replaceSpecialChars(filename) {
        return filename.replace(/[\\\/:*?"<>|\[\]()^#%&!@:+={}'~]/g, "_");
    }
}
