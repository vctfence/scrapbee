import {settings} from "./settings.js";
import {sleep} from "./utils.js";

const SCRAPYARD_SIDEBAR_URL = browser.runtime.getURL("/ui/sidebar.html");

export async function findSidebarWindow() {
    const popupWindows = await browser.windows.getAll({
        populate: true,
        windowTypes: ["popup"]
    });

    for (const window of popupWindows)
        if (window.tabs.some(t => t.url === SCRAPYARD_SIDEBAR_URL))
            return window;
}

export async function createSidebarWindow(focused = true) {
    const position = await settings.sidebar_window_position() || {};
    const params = {
        url: SCRAPYARD_SIDEBAR_URL,
        type: "popup",
        focused,
        width: position.width || 400,
        top: position.top || 50,
        left: position.left || 50,
    };

    if (position.height)
        params.height = position.height;

    try {
        await browser.windows.create(params);
    }
    catch (e) {
        console.error(e);

        params.width = 400;
        params.top = 50;
        params.left = 50;
        await browser.windows.create(params);
    }
}

export async function toggleSidebarWindow() {
    const sidebarWindow = await findSidebarWindow();

    if (sidebarWindow)
        await browser.windows.update(sidebarWindow.id, {focused: true});
    else
        await createSidebarWindow();
}

export async function ensureSidebarWindow(sleepMs) {
    const sidebarWindow = await findSidebarWindow();

    if (!sidebarWindow) {
        await createSidebarWindow(false);
        await sleep(sleepMs || 700);
    }
}
