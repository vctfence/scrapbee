import {send} from "./proxy.js";
import {settings} from "./settings.js";
import {JSONStorage} from "./storage_json.js";
import {readBlob} from "./utils.js";

import DropboxAuth from "./lib/dropbox/auth.js";
import Dropbox from "./lib/dropbox/dropbox.js"

const APP_KEY = "0y7co3j1k4oc7up";
const DROPBOX_APP_PATH = "/Cloud";
const DROPBOX_INDEX_PATH = "/Cloud/index.json";
const REDIRECT_URL = "https://gchristensen.github.io/scrapyard/";

export class DropboxBackend {
    constructor() {
        this.dbxAuth = new DropboxAuth({clientId: APP_KEY});
        this.dbx = new Dropbox({auth: this.dbxAuth});
        this.assetManager = this.newAssetManager();

        settings.load(async settings => {
            let refreshToken = settings.dropbox_refresh_token();
            if (refreshToken) {
                this.dbxAuth.setRefreshToken(refreshToken);
            }
            else {
                browser.runtime.onMessage.addListener((request) => {
                    if (request.type === "DROPBOX_AUTHENTICATED") {
                        this.dbxAuth.setRefreshToken(request.refreshToken);
                    }
                });
            }
        });
    }

    isAuthenticated() {
        return !!settings.dropbox_refresh_token();
    }

    async authenticate(signin = true) {
        if (signin) {
            return new Promise(async (resolve, reject) => {
                if (settings.dropbox_refresh_token()) {
                    resolve(true);
                    return;
                }

                this.dbxAuth.getAuthenticationUrl(REDIRECT_URL, undefined, 'code',
                    'offline', undefined, undefined, true)
                    .then(async authUrl => {
                        let dropboxTab = await browser.tabs.create({url: authUrl});
                        let listener = async (id, changed, tab) => {
                            if (id === dropboxTab.id) {
                                if (changed.url && changed.url.startsWith(REDIRECT_URL)) {
                                    await browser.tabs.onUpdated.removeListener(listener);
                                    browser.tabs.remove(dropboxTab.id);

                                    if (changed.url.includes("code=")) {
                                        const code = changed.url.match(/.*code=(.*)$/i)[1];
                                        this.dbxAuth.getAccessTokenFromCode(REDIRECT_URL, code)
                                            .then((response) => {
                                                const refreshToken = response.result.refresh_token;
                                                this.dbxAuth.setRefreshToken(refreshToken);
                                                settings.dropbox_refresh_token(refreshToken);
                                                send.dropboxAuthenticated({refreshToken});

                                                if (settings.dropbox___dbat())
                                                    settings.dropbox___dbat(null);

                                                resolve(true);
                                            })
                                            .error(e => {
                                                console.log(e);
                                                resolve(false);
                                            });
                                    }
                                    else
                                        resolve(false);
                                }
                            }
                        };
                        browser.tabs.onUpdated.addListener(listener);
                    })
                    .catch((error) => {
                        console.error(error);
                        resolve(false);
                    });
            });
        }
        else
            settings.dropbox_refresh_token(null);
    }

    newAssetManager() {
        let storeAsset = ext => {
            return async (node, data) => {
                try {
                    await this.dbx.filesUpload({
                        path: `${DROPBOX_APP_PATH}/${node.uuid}.${ext}`,
                        mode: "overwrite",
                        mute: true,
                        contents: data
                    });
                } catch (e) {
                    console.log(e);
                }
            };
        }

        let fetchAsset = ext => {
            return async (node) => {
                try {
                    const {result: {fileBlob}} = await this.dbx.filesDownload( {
                        path: `${DROPBOX_APP_PATH}/${node.uuid}.${ext}`
                    });

                    return readBlob(fileBlob, node.byte_length? "binary": "string");
                }
                catch (e) {
                    console.log(e);
                }
            };
        }

        let deleteAsset = ext => {
            return async (node) => {
                try {
                    await this.dbx.filesDeleteV2( {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.${ext}`
                    });
                }
                catch (e) {
                    console.log(e);
                }
            };
        }

        let manager = {};

        manager.storeNotes = storeAsset("notes");
        manager.fetchNotes = fetchAsset("notes")
        manager.deleteNotes = deleteAsset("notes");

        manager.storeData = storeAsset("data");
        manager.fetchData = fetchAsset("data")
        manager.deleteData = deleteAsset("data");

        manager.storeIcon = storeAsset("icon");
        manager.fetchIcon = fetchAsset("icon")
        manager.deleteIcon = deleteAsset("icon");

        manager.storeComments = storeAsset("comments");
        manager.fetchComments = fetchAsset("comments")
        manager.deleteComments = deleteAsset("comments");

        manager.storeView = storeAsset("view");
        manager.fetchView = fetchAsset("view");
        manager.deleteView = deleteAsset("view");

        return manager;
    }

    async upload(path, filename, content, reentry) {
        await this.authenticate();
        return this.dbx.filesUpload({
            path: path + filename.replace(/[\\\/:*?"<>|\[\]()^#%&!@:+={}'~]/g, "_"),
            mode: "add",
            autorename: true,
            mute: false,
            strict_conflict: false,
            contents: content
        });
    };

    async getDB(blank = false) {
        let storage = null;

        if (!blank)
            try {
                const {result: {fileBlob}} = await this.dbx.filesDownload( {path: DROPBOX_INDEX_PATH});
                storage = JSONStorage.fromJSON(await readBlob(fileBlob));
            }
            catch (e) {
                if (e.status === 409) { // no index.js file
                    if (e.error.error_summary.startsWith("path/not_found"))
                        storage = new JSONStorage({cloud: "Scrapyard"});
                    }
                else
                    console.log(e);
            }
        else
            storage = new JSONStorage({cloud: "Scrapyard"});

        if (storage)
            Object.assign(storage, this.assetManager);

        return storage;
    }

    async persistDB(db) {
        await this.dbx.filesUpload({
                path: DROPBOX_INDEX_PATH,
                mode: "overwrite",
                mute: true,
                contents: db.serialize()
            });
    }

    async getLastModified() {
        try {
            const {result: meta} = await this.dbx.filesGetMetadata({
                "path": DROPBOX_INDEX_PATH
            });

            if (meta && meta.server_modified)
                return new Date(meta.server_modified);
        }
        catch (e) {
            console.log(e);
        }

        return null;
    }
}

export let dropboxBackend = new DropboxBackend();
