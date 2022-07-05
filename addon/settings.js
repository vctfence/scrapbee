import {merge} from "./utils.js";

const SCRAPYARD_SETTINGS_KEY = "scrapyard-settings";
const SCRAPYARD_UPDATED_KEY = "scrapyard-updated";

class ScrapyardSettings {
    constructor() {
        this._default = {
            export_format: "json",
            shelf_list_height: 600,
            helper_port_number: 20202,
            show_firefox_bookmarks: true,
            switch_to_new_bookmark: true,
            enable_backup_compression: true,
            visual_archive_icon: true,
            visual_archive_color: true
        };

        this._bin = {};
        this._key = SCRAPYARD_SETTINGS_KEY;
    }

    async _loadPlatform() {
        if (!this._platform) {
            const platformInfo = await browser.runtime.getPlatformInfo();
            this._platform = {[platformInfo.os]: true};
            if (navigator.userAgent.indexOf("Firefox") >= 0) {
                this._platform.firefox = true;
            }
        }
    }

    async _loadSettings() {
        const object = await browser.storage.local.get(this._key);
        this._bin = merge(object?.[this._key] || {}, this._default);
    }

    async _load() {
        await this._loadPlatform();
        await this._loadSettings();
    }

    async _save() {
        return browser.storage.local.set({[this._key]: this._bin});
    }

    _setAddonUpdated() {
        localStorage.setItem(SCRAPYARD_UPDATED_KEY, "true");
    }

    _isAddonUpdated() {
        const updated = localStorage.getItem(SCRAPYARD_UPDATED_KEY) === "true";
        localStorage.setItem(SCRAPYARD_UPDATED_KEY, "false");
        return updated;
    }

    get(target, key, receiver) {
        if (key === "load")
            return v => this._load(); // sic !
        else if (key === "default")
            return this._default;
        else if (key === "platform")
            return this._platform;
        else if (key === "setAddonUpdated")
            return this._setAddonUpdated;
        else if (key === "isAddonUpdated")
            return this._isAddonUpdated;

        return val => {
            let bin = this._bin;

            if (val === undefined)
                return bin[key];

            let deleted;
            if (val === null) {
                deleted = bin[key];
                delete bin[key]
            }
            else
                bin[key] = val;

            let result = key in bin? bin[key]: deleted;
            return this._save().then(() => result);
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
