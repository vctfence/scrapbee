// permanently keeps the background page in memory
// adapted from https://stackoverflow.com/questions/66618136/persistent-service-worker-in-chrome-extension

let lifeline;

keepAlive();

browser.runtime.onConnect.addListener(port => {
    if (port.name === "keepAlive") {
        lifeline = port;
        setTimeout(keepAliveForced, 25000); // 25 seconds
        port.onDisconnect.addListener(keepAliveForced);
    }
});

function keepAliveForced() {
    lifeline?.disconnect();
    lifeline = null;
    keepAlive();
}

async function keepAlive() {
    if (lifeline) return;

    for (const tab of await browser.tabs.query({})) {
        try {
            await browser.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => chrome.runtime.connect({ name: "keepAlive" }),
            });
            browser.tabs.onUpdated.removeListener(retryOnTabUpdate);
            return;
        } catch (e) {}
    }
    browser.tabs.onUpdated.addListener(retryOnTabUpdate);
}

async function retryOnTabUpdate(tabId, info, tab) {
    if (info.url && /^(about|blob|https?):/.test(info.url)) {
        keepAlive();
    }
}
