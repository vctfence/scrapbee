export async function scriptsAllowed(tabId, frameId = 0) {
    try {
        await browser.tabs.executeScript(tabId, {
            frameId: frameId,
            runAt: 'document_start',
            code: 'true;'
        });
        return true;
    } catch (e) {
    }
}

export function showNotification(args) {
    if (typeof arguments[0] === "string")
        args = {message: arguments[0]}

    return browser.notifications.create(`sbi-notification-${args.type}`, {
        type: args.type ? args.type : 'basic',
        title: args.title ? args.title : 'Scrapyard',
        message: args.message,
        iconUrl: '/icons/scrapyard.svg'
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

export function selectricRefresh(element, widthInc = 5) {
    element.selectric("refresh");
    if (widthInc) {
        let wrapper = element.closest(".selectric-wrapper");
        wrapper.width(wrapper.width() + widthInc);
    }
}
