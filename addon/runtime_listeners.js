const INSTALL_SETTINGS_KEY = "install-settings";
const SCRAPYARD_UPDATED_KEY = "scrapyard-updated";

browser.runtime.onInstalled.addListener(async details => {
    if (details.reason === "install") {
        chrome.storage.local.set({[INSTALL_SETTINGS_KEY]: {
                install_date: Date.now(),
                install_version: browser.runtime.getManifest().version
            }});
    }
    else if (details.reason === "update") {
        if (browser.storage.session)
            await browser.storage.session.set({[SCRAPYARD_UPDATED_KEY]: true});
        else
            localStorage.setItem(SCRAPYARD_UPDATED_KEY, "true");
    }
});
