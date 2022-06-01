function parseHtml(htmlText) {
    let doc = document.implementation.createHTMLDocument("")
        , doc_elt = doc.documentElement
        , first_elt;

    doc_elt.innerHTML = htmlText;
    first_elt = doc_elt.firstElementChild;

    if (doc_elt.childElementCount === 1
        && first_elt.localName.toLowerCase() === "html") {
        doc.replaceChild(first_elt, doc_elt);
    }

    return doc;
}

function installScrapyardURLs(doc, siteMap, blank) {
    doc.querySelectorAll("a").forEach(
        function (element) {
            const url = element.getAttribute("data-scrapyard-href");
            const uuid = siteMap[url];
            if (uuid) {
                element.href = "ext+scrapyard://" + uuid;
                if (blank)
                    element.setAttribute("target", "_blank");
            }
        });
}

function processIFrames(doc, siteMap) {
    doc.querySelectorAll("iframe").forEach(
        function (element) {
            const html = element.srcdoc;
            if (html) {
                const srcdoc = parseHtml(html);
                processIFrames(srcdoc, siteMap);
                installScrapyardURLs(srcdoc, siteMap, true);
                element.srcdoc = "<!DOCTYPE html>" + srcdoc.documentElement.outerHTML;
            }
        });
}

function configureSiteLinks(siteMap) {
    installScrapyardURLs(document, siteMap);
    processIFrames(document, siteMap);
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "CONFIGURE_SITE_LINKS":
            configureSiteLinks(message.siteMap);
            break;
    }
});
