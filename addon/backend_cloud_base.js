import {CloudStorage} from "./storage_cloud.js";

export class CloudError {
    constructor(message) {
        this.message = message;
    }
}

export class CloudItemNotFoundError extends CloudError {
}

export class BackendCloudBase {
    static CLOUD_SHELF_PATH = "/Cloud";
    static CLOUD_SHELF_INDEX = "index.jsonl";
    static REDIRECT_URL = "https://gchristensen.github.io/scrapyard/";

    constructor() {
        this._assetMethods = this._createAssetMethods();
    }

    async authenticate() {
        return new Promise(async (resolve, reject) => {
            if (this.isAuthenticated())
                resolve(true);
            else {
                try {
                    let authTab = await browser.tabs.create({url: await this._getAuthorizationUrl()});

                    let listener = async (id, changed, tab) => {
                        if (id === authTab.id && changed.url?.startsWith(BackendCloudBase.REDIRECT_URL)) {
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

    _createAssetMethods() {
        let storeAsset = ext => {
            return async (node, data) => {
                try {
                    const path = `${BackendCloudBase.CLOUD_SHELF_PATH}/${node.uuid}.${ext}`
                    await this.uploadFile(path, data);
                } catch (e) {
                    console.error(e);
                }
            };
        }

        let fetchAsset = ext => {
            return async (node) => {
                try {
                    const path = `${BackendCloudBase.CLOUD_SHELF_PATH}/${node.uuid}.${ext}`
                    return await this.downloadFile(path)
                }
                catch (e) {
                    console.error(e);
                }
            };
        }

        let deleteAsset = ext => {
            return async (node) => {
                try {
                    const path = `${BackendCloudBase.CLOUD_SHELF_PATH}/${node.uuid}.${ext}`
                    await this.deleteFile(path)
                }
                catch (e) {
                    console.error(e);
                }
            };
        }

        let methods = {};

        methods.storeNotes = storeAsset("notes");
        methods.fetchNotes = fetchAsset("notes")
        methods.deleteNotes = deleteAsset("notes");

        methods.storeData = storeAsset("data");
        methods.fetchData = fetchAsset("data")
        methods.deleteData = deleteAsset("data");

        methods.storeIcon = storeAsset("icon");
        methods.fetchIcon = fetchAsset("icon")
        methods.deleteIcon = deleteAsset("icon");

        methods.storeComments = storeAsset("comments");
        methods.fetchComments = fetchAsset("comments")
        methods.deleteComments = deleteAsset("comments");

        methods.storeView = storeAsset("view");
        methods.fetchView = fetchAsset("view");
        methods.deleteView = deleteAsset("view");

        return methods;
    }

    async downloadDB() {
        let storage = null;

        try {
            const path = `${BackendCloudBase.CLOUD_SHELF_PATH}/${BackendCloudBase.CLOUD_SHELF_INDEX}`;
            const content = await this.downloadFile(path);
            storage = CloudStorage.deserialize(content);
        }
        catch (e) {
            if (e instanceof CloudItemNotFoundError)
                storage = new CloudStorage({cloud: "Scrapyard"});
            else if (e instanceof CloudError)
                throw e;
        }

        if (storage)
            Object.assign(storage, this._assetMethods);

        return storage;
    }

    async persistDB(db) {
        const path = `${BackendCloudBase.CLOUD_SHELF_PATH}/${BackendCloudBase.CLOUD_SHELF_INDEX}`;
        const content = db.serialize();
        this.uploadFile(path, content);
    }

    _replaceSpecialChars(filename) {
        return filename.replace(/[\\\/:*?"<>|\[\]()^#%&!@:+={}'~]/g, "_");
    }
}
