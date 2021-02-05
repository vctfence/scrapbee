import {settings} from "./settings.js";
import {dropbox} from "./lib/dropbox.js";
import {JSONStorage} from "./storage_json.js";
import {readBlob} from "./utils.js";

const DROPBOX_APP_PATH = "/Cloud";
const DROPBOX_INDEX_PATH = "/Cloud/index.json";

export class DropboxBackend {
    constructor() {
        this.APP_KEY = "0y7co3j1k4oc7up";

        this.auth_handler = auth_url => new Promise(async (resolve, reject) => {
            let dropbox_tab = await browser.tabs.create({url: auth_url});
            let listener = async (id, changed, tab) => {
                if (id === dropbox_tab.id) {
                    if (changed.url && !changed.url.includes("dropbox.com")) {
                        await browser.tabs.onUpdated.removeListener(listener);
                        browser.tabs.remove(dropbox_tab.id);
                        resolve(changed.url);
                    }
                }
            };
            browser.tabs.onUpdated.addListener(listener);
        });

        this.token_store = function(key, val) {
            return arguments.length > 1
                ? settings[`dropbox_${key}`](val)
                : settings[`dropbox_${key}`]();
        };

        dropbox.setTokenStore(this.token_store);
    }

    isAuthenticated() {
        return !!settings["dropbox___dbat"]();
    }

    async authenticate(signin = true) {
        if (signin)
            return dropbox.authenticate({client_id: this.APP_KEY,
                redirect_uri: "https://gchristensen.github.io/scrapyard/",
                auth_handler: this.auth_handler});
        else
            settings["dropbox___dbat"](null);
    }

    async upload(path, filename, content, reentry) {
        await this.authenticate();
        return dropbox('files/upload', {
            "path": path + filename.replace(/[\\\/:*?"<>|\[\]()^#%&!@:+={}'~]/g, "_"),
            "mode": "add",
            "autorename": true,
            "mute": false,
            "strict_conflict": false
        }, content).then(o => null /*console.log(o)*/)
            .catch(xhr => {
                if (!reentry && xhr.status >= 400 && xhr.status < 500) {
                    this.token_store("__dbat", "");
                    return this.upload(filename, content, true);
                }
            })
    };

    async getDB(blank = false) {
        let storage = null;

        if (!blank)
            try {
                let [_, blob] = await dropbox('files/download', {
                    "path": DROPBOX_INDEX_PATH
                });

                storage = JSONStorage.fromJSON(await readBlob(blob));
            }
            catch (e) {
                if (e.status === 409 && e.statusText.startsWith("path/not_found"))
                    storage = new JSONStorage({cloud: "Scrapyard"});
                else
                    console.log(e);
            }
        else
            storage = new JSONStorage({cloud: "Scrapyard"});

        if (storage) {
            storage.storeNotes = async (node, notes) => {
                try {
                    await dropbox('files/upload', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.notes`,
                        "mode": "overwrite",
                        "mute": true
                    }, notes);
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.fetchNotes = async (node) => {
                try {
                    let [_, blob] = await dropbox('files/download', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.notes`,
                    });

                    return readBlob(blob);
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.deleteNotes = async (node) => {
                try {
                    await dropbox('files/delete_v2', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.notes`
                    });
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.storeData = async (node, data) => {
                try {
                    await dropbox('files/upload', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.data`,
                        "mode": "overwrite",
                        "mute": true
                    }, data);
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.fetchData = async (node) => {
                try {
                    let [_, blob] = await dropbox('files/download', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.data`,
                    });

                    return readBlob(blob, node.byte_length? "binary": "string");
                }
                catch (e) {
                    console.log(e);
                }
            };

            storage.deleteData = async (node) => {
                try {
                    await dropbox('files/delete_v2', {
                        "path": `${DROPBOX_APP_PATH}/${node.uuid}.data`
                    });
                }
                catch (e) {
                    console.log(e);
                }
            };
        }

        return storage;
    }

    async persistDB(db) {
        return dropbox('files/upload', {
            "path": DROPBOX_INDEX_PATH,
            "mode": "overwrite",
            "mute": true
        }, db.serialize())
    }

    async getLastModified() {
        try {
            let meta = await dropbox("files/get_metadata", {
                "path": DROPBOX_INDEX_PATH
            });

            if (meta && meta.server_modified)
                return new Date(meta.server_modified);
        }
        catch (e) {
            console.log(e);
        }
    }
}

export let dropboxBackend = new DropboxBackend();
