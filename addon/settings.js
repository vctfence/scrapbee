let BinHandler = {
    get(target, key) {
        if (key === "load")
            return target.__load__;

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

export const SETTINGS_KEY = "scrapyard-settings";
export const DEFAULT_SETTINGS = {
    shallow_export: false,
    show_firefox_bookmarks: true,
    switch_to_new_bookmark: true,
    shelf_list_height: 600
};

export let settings = new Proxy({
    __proto__ : null,
    __key__   : SETTINGS_KEY,
    __bin__   : DEFAULT_SETTINGS,
    __load__  : function(f) {
        if (f) {
            chrome.storage.local.get(SETTINGS_KEY, object => {
                settings.__bin__ = object[SETTINGS_KEY] ? object[SETTINGS_KEY] : DEFAULT_SETTINGS;
                if (f) f(this);
            });
        }
        else {
            return browser.storage.local.get(SETTINGS_KEY).then(object => {
                settings.__bin__ = object[SETTINGS_KEY] ? object[SETTINGS_KEY] : DEFAULT_SETTINGS;
            });
        }
    }
}, BinHandler);

settings.load();

chrome.storage.onChanged.addListener(function (changes,areaName) {
    settings.load()
});
