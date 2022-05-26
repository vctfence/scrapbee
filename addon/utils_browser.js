async function injectCSSFileMV3(tabId, options) {
    return browser.scripting.insertCSS({target: {tabId}, files: [options.file]})
}

// TODO: change to injectCSSFileMV3
export const injectCSSFile = browser.tabs.insertCSS;
//export const injectCSSFile = injectCSSFileMV3;

async function injectScriptFileMV3(tabId, options) {
    const target = {tabId};

    if (options.frameId)
        target.frameIds = [options.frameId];

    if (options.allFrames)
        target.allFrames = options.allFrames;

    return browser.scripting.executeScript({target, files: [options.file]});
}

// TODO: change to injectScriptFileMV3
export const injectScriptFile = browser.tabs.executeScript;
//export const injectScriptFile = injectScriptFileMV3;

async function scriptsAllowedMV3(tabId, frameId = 0) {
    try {
        await browser.scripting.executeScript({
            target: {tabId, frameIds: [frameId]},
            injectImmediately: true,
            func: () => true,
        });

        return true;
    }
    catch (e) {}

    return false;
}

async function scriptsAllowedMV2(tabId, frameId = 0) {
    try {
        await browser.tabs.executeScript(tabId, {
            frameId: frameId,
            runAt: "document_start",
            code: "true"
        });
        return true;
    } catch (e) {}
}

// TODO: change to scriptsAllowedMV3
export const scriptsAllowed = scriptsAllowedMV2;
//export const scriptsAllowed = scriptsAllowedMV3;

export function showNotification(args) {
    if (typeof arguments[0] === "string")
        args = {message: arguments[0]}

    return browser.notifications.create(`sbi-notification-${args.type}`, {
        type: args.type ? args.type : "basic",
        title: args.title ? args.title : "Scrapyard",
        message: args.message,
        iconUrl: "/icons/scrapyard.svg"
    });
}

export async function getActiveTab() {
    const tabs = await browser.tabs.query({lastFocusedWindow: true, active: true});
    return tabs && tabs.length ? tabs[0] : null;
}

export async function openPage(url) {
    return browser.tabs.create({"url": url});
}

export async function updateTab(tab, url, preserveHistory) {
    return browser.tabs.update(tab.id, {"url": url, "loadReplace": !preserveHistory})
}

export async function openContainerTab(url, container) {
    try {
        return await browser.tabs.create({"url": url, cookieStoreId: container});
    } catch (e) {
        if (e.message?.includes("cookieStoreId"))
            showNotification("Invalid bookmark container.");

        return browser.tabs.create({"url": url});
    }
}

export const CONTEXT_BACKGROUND = 0;
export const CONTEXT_FOREGROUND = 1;

export function getContextType() {
    return window.location.pathname === "/background.html"? CONTEXT_BACKGROUND: CONTEXT_FOREGROUND;
}
