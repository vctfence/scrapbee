const SETTINGS_KEY = "scrapyard-settings";

browser.runtime.onInstalled.addListener(details => {
    if (details.reason === "install") {
        chrome.storage.local.get(SETTINGS_KEY, settings => {
            settings = settings[SETTINGS_KEY];
            settings.install_date = (new Date).getTime();
            chrome.storage.local.set({[SETTINGS_KEY]: settings});
        });
    }
    else if (details.reason === "update") {
        //settings.pending_announcement(true);
    }
});
