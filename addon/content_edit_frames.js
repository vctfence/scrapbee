

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "GET_FRAME_HTML":
            configureSiteLinks(message.siteMap);
            break;
    }
});
