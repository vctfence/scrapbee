let BinHandler = {
    get(target, key) {
        return (val) => {
            let bin = target.__bin__;
            if (val === void 0) return bin[key];
            if (val === null) {
                var old = bin[key];
                delete bin[key]
            }
            else bin[key] = val;
            chrome.storage.local.set({[target.__key__]: bin});
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

export const SETTING_KEY = "scrapyard-settings";
export const DEFAULT_SETTINGS = {
    'arcive_url_lifetime': 10,
    'shallow_export': false
};

export let settings = new Proxy({
    __proto__: null,
    __key__: SETTING_KEY,
    __bin__: DEFAULT_SETTINGS,
}, BinHandler);

chrome.storage.local.get(SETTING_KEY, function (object) {
    settings.__bin__ = object[SETTING_KEY]? object[SETTING_KEY]: DEFAULT_SETTINGS;
});

chrome.storage.onChanged.addListener(
    function(changes,areaName) {
        chrome.storage.local.get(SETTING_KEY, function (object) {
            settings.__bin__ = object[SETTING_KEY]? object[SETTING_KEY]: DEFAULT_SETTINGS;
        });
    });
