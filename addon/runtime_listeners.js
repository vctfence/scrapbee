const SCRAPYARD_SETTINGS_KEY = "scrapyard-settings";
const INSTALL_SETTINGS_KEY = "install-settings";
const SCRAPYARD_UPDATED_KEY = "scrapyard-updated";

browser.runtime.onInstalled.addListener(async details => {
    if (details.reason === "install") {
        await writeInstallVersion();
    }
    else if (details.reason === "update") {
        await setUpdatedFlag();
        await setTransitionToDiskFlag();
    }
});

function writeInstallVersion() {
    return browser.storage.local.set({[INSTALL_SETTINGS_KEY]: {
        install_date: Date.now(),
        install_version: browser.runtime.getManifest().version
    }});
}

async function setUpdatedFlag() {
    if (browser.storage.session)
        return browser.storage.session.set({[SCRAPYARD_UPDATED_KEY]: true});
    else
        localStorage.setItem(SCRAPYARD_UPDATED_KEY, "true");
}

async function setTransitionToDiskFlag() {
    const installSettings = (await browser.storage.local.get(INSTALL_SETTINGS_KEY))?.[INSTALL_SETTINGS_KEY];
    const scrapyardSettings = (await browser.storage.local.get(SCRAPYARD_SETTINGS_KEY))?.[SCRAPYARD_SETTINGS_KEY] || {};
    const installVersionMajor = installSettings?.install_version?.split(".")?.[0];
    const updatedToV2 = !installVersionMajor || parseInt(installVersionMajor) < 2;
    const transitionToDisk = scrapyardSettings["transition_to_disk"];

    if (updatedToV2 && transitionToDisk !== false) {
        scrapyardSettings["transition_to_disk"] = true;
        return browser.storage.local.set({[SCRAPYARD_SETTINGS_KEY]: scrapyardSettings});
    }
}
