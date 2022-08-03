const SCRAPYARD_SIDEBAR_URL = browser.runtime.getURL("/ui/sidebar.html");

async function findSidebarWindow() {
    const popupWindows = await browser.windows.getAll({
        populate: true,
        windowTypes: ["popup"]
    });

    for (const window of popupWindows)
        if (window.tabs.some(t => t.url ===SCRAPYARD_SIDEBAR_URL))
            return window;
}

export async function createSidebarWindow(focused = true) {
    const params = {
        url: SCRAPYARD_SIDEBAR_URL,
        type: "popup",
        focused,
        width: 400,
        top: 50,
        left: 50,
    };

    await browser.windows.create(params);
}

export async function toggleSidebarWindow() {
    const sidebarWindow = await findSidebarWindow();

    if (sidebarWindow)
        await browser.windows.update(sidebarWindow.id, {focused: true});
    else
        await createSidebarWindow();
}
