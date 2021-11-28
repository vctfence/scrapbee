const SETTINGS_KEY = "scrapyard-settings";
const INSTALL_SETTINGS_KEY = "install-settings";

browser.runtime.onInstalled.addListener(details => {
    if (details.reason === "install") {
        chrome.storage.local.set({[INSTALL_SETTINGS_KEY]: {
            install_date: Date.now(),
            install_version: browser.runtime.getManifest().version // since v0.12.2
        }});
    }
    else if (details.reason === "update") {
        // chrome.storage.local.get(SETTINGS_KEY, settings => {
        //     settings = settings[SETTINGS_KEY];
        //     settings.pending_announcement = "options.html#about";
        //     chrome.storage.local.set({[SETTINGS_KEY]: settings});
        // });
    }
});
