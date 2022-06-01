function showSiteCaptureOptions() {
    const iframeId = "scrapyard-site-capture-frame";
    const iframe = document.getElementById(iframeId);

    if (!iframe) {
        const dim = document.createElement('div')
        dim.id = "scrapyard-dim";
        document.body.insertBefore(dim, document.body.firstChild);

        const options = document.createElement('iframe');
        options.id = iframeId;
        options.style.overflow = "hidden";
        options.src = browser.runtime.getURL("ui/site_capture.html");
        document.body.insertBefore(options, document.body.firstChild);
    }
}

function hideSiteCaptureOptions() {
    document.querySelectorAll(`#scrapyard-site-capture-frame, #scrapyard-dim`)
        .forEach(element => {
            element.remove();
        });
}

var bookmark;

browser.runtime.onMessage.addListener(message => {
    switch (message.type) {
        case "storeBookmark":
            bookmark = message.bookmark;
            break;
        case "continueSiteCapture":
            bookmark.__site_capture = message.options;
            browser.runtime.sendMessage({type: "performSiteCapture", bookmark});
            // no break
        case "cancelSiteCapture":
            hideSiteCaptureOptions();
            break;
    }
});

showSiteCaptureOptions();


