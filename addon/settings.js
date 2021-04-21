let BinHandler = {
    get(target, key) {
        if (key === "load")
            return target.__load__;

        return (val, handler) => {
            let bin = target.__bin__;
            if (val === void 0) return bin[key];
            if (val === null) {
                var old = bin[key];
                delete bin[key]
            }
            else bin[key] = val;
            chrome.storage.local.set({[target.__key__]: bin}, () => handler? handler(): null);
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
    switch_to_new_bookmark: true
};

export let settings = new Proxy({
    __proto__ : null,
    __key__   : SETTINGS_KEY,
    __bin__   : DEFAULT_SETTINGS,
    __load__  : function(f) {
        chrome.storage.local.get(SETTINGS_KEY, object => {
            settings.__bin__ = object[SETTINGS_KEY]? object[SETTINGS_KEY]: DEFAULT_SETTINGS;
            if (f) f(this);
        });
    }
}, BinHandler);

settings.load();

chrome.storage.onChanged.addListener(function (changes,areaName) {
    settings.load()
});
