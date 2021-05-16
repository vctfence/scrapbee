const SETTINGS_KEY = "scrapyard-settings";

browser.runtime.onInstalled.addListener(details => {
    if (details.reason === "install") {
        chrome.storage.local.get(SETTINGS_KEY, settings => {
            settings = settings[SETTINGS_KEY];
            settings.install_date = (new Date).getTime();
            settings.install_version = browser.runtime.getManifest().version; // since v0.12
            chrome.storage.local.set({[SETTINGS_KEY]: settings});
        });
    }
    else if (details.reason === "update") {
        // chrome.storage.local.get(SETTINGS_KEY, settings => {
        //     settings = settings[SETTINGS_KEY];
        //     settings.pending_announcement = "options.html#about";
        //     chrome.storage.local.set({[SETTINGS_KEY]: settings});
        // });
    }
});
