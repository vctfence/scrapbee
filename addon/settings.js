import {merge} from "./utils.js";

const SCRAPYARD_SETTINGS_KEY = "scrapyard-settings";

class ScrapyardSettings {
    constructor() {
        this._default = {
            export_format: "json",
            shelf_list_height: 600,
            helper_port_number: 20202,
            show_firefox_bookmarks: true,
            switch_to_new_bookmark: true,
            enable_backup_compression: true
        };

        this._bin = {};
        this._key = SCRAPYARD_SETTINGS_KEY;
    }

    async _loadPlatform() {
        if (!this._platform) {
            const platformInfo = await browser.runtime.getPlatformInfo();
            this._platform = {[platformInfo.os]: true};
        }
    }

    async _loadSettings() {
        const object = await browser.storage.local.get(this._key);
        this._bin = merge(object[this._key] || {}, this._default);
    }

    _load() {
        return this._loadPlatform().then(() => this._loadSettings());
    }

    get(target, key, receiver) {
        if (key === "load")
            return v => this._load();
        else if (key === "default")
            return this._default;
        else if (key === "platform")
            return this._platform;

        return (val, callback) => {
            let bin = this._bin;
            if (val === undefined) return bin[key];
            if (val === null) {
                var old = bin[key];
                delete bin[key]
            }
            else bin[key] = val;
            let result = key in bin? bin[key]: old;
            return new Promise(resolve => chrome.storage.local.set({[this._key]: bin},
                () => {
                    if (callback)
                        callback(result);
                    resolve(result);
                }));
        }
    }

    has(target, key) {
        return key in this._bin;
    }

    * enumerate() {
        for (let key in this._bin) yield key;
    }
}

export let settings = new Proxy({}, new ScrapyardSettings());

chrome.storage.onChanged.addListener(function (changes, areaName) {
    if (changes[SCRAPYARD_SETTINGS_KEY])
        settings.load();
});
