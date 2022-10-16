const SCRAPYARD_SETTINGS_KEY = "scrapyard-settings";
const INSTALL_SETTINGS_KEY = "install-settings";

browser.runtime.onInstalled.addListener(async details => {
    if (details.reason === "install") {
        await writeInstallVersion();
    }
    else if (details.reason === "update") {
        const scrapyardSettings = (await browser.storage.local.get(SCRAPYARD_SETTINGS_KEY))?.[SCRAPYARD_SETTINGS_KEY] || {};
        await setAnnouncement(scrapyardSettings);
        await setTransitionToDiskFlag(scrapyardSettings);
    }
});

function writeInstallVersion() {
    return browser.storage.local.set({[INSTALL_SETTINGS_KEY]: {
        install_date: Date.now(),
        install_version: browser.runtime.getManifest().version
    }});
}

async function setAnnouncement(scrapyardSettings) {
    if (/^\d+\.\d+$/.test(_ADDON_VERSION)) {
        scrapyardSettings["pending_announcement"] = "/ui/options.html#about";
        return browser.storage.local.set({[SCRAPYARD_SETTINGS_KEY]: scrapyardSettings});
    }
}

async function setTransitionToDiskFlag(scrapyardSettings) {
    const installSettings = (await browser.storage.local.get(INSTALL_SETTINGS_KEY))?.[INSTALL_SETTINGS_KEY];
    const installVersionMajor = installSettings?.install_version?.split(".")?.[0];
    const updatedToV2 = !installVersionMajor || parseInt(installVersionMajor) < 2;
    const transitionToDisk = scrapyardSettings["transition_to_disk"];

    if (updatedToV2 && transitionToDisk !== false) {
        scrapyardSettings["transition_to_disk"] = true;
        return browser.storage.local.set({[SCRAPYARD_SETTINGS_KEY]: scrapyardSettings});
    }
}
