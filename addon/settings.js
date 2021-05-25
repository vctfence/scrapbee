const SCRAPYARD_SETTINGS_KEY = "scrapyard-settings";
const DEFAULT_SETTINGS = {
    shelf_list_height: 600,
    show_firefox_bookmarks: true,
    switch_to_new_bookmark: true,
    enable_backup_compression: true
};

let BinHandler = {
    get(target, key) {
        if (key === "load")
            return target.__load__;
        else if (key === "default")
            return DEFAULT_SETTINGS;

        return (val, callback) => {
            let bin = target.__bin__;
            if (val === void 0) return bin[key];
            if (val === null) {
                var old = bin[key];
                delete bin[key]
            }
            else bin[key] = val;
            chrome.storage.local.set({[target.__key__]: bin}, () => callback? callback(): null);
            return key in bin ? bin[key] : old
        }
    },
    has(target, key) {
        return key in target.__bin__;
    },
    * enumerate(target) {
        for (let key in target.__bin__) yield key;
    },
};

export let settings = new Proxy({
    __proto__ : null,
    __key__   : SCRAPYARD_SETTINGS_KEY,
    __bin__   : DEFAULT_SETTINGS,
    __load__  : function(f) {
        if (f) {
            chrome.storage.local.get(SCRAPYARD_SETTINGS_KEY, object => {
                settings.__bin__ = object[SCRAPYARD_SETTINGS_KEY] ? object[SCRAPYARD_SETTINGS_KEY] : DEFAULT_SETTINGS;
                f(this);
            });
        }
        else {
            return browser.storage.local.get(SCRAPYARD_SETTINGS_KEY).then(object => {
                settings.__bin__ = object[SCRAPYARD_SETTINGS_KEY] ? object[SCRAPYARD_SETTINGS_KEY] : DEFAULT_SETTINGS;
            });
        }
    }
}, BinHandler);

settings.load();

chrome.storage.onChanged.addListener(function (changes, areaName) {
    settings.load()
});
