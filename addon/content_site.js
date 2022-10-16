var configured;

function makeReferenceURL(uuid, useProtocol) {
    let referenceURL = `ext+scrapyard://${uuid}`;

    if (!useProtocol)
        referenceURL = browser.runtime.getURL(`/reference.html#${referenceURL}`);

    return referenceURL;
}

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

function installScrapyardURLs(doc, siteMap, blank, useProtocol) {
    doc.querySelectorAll("a").forEach(
        function (element) {
            const url = element.getAttribute("data-scrapyard-href");
            const uuid = siteMap[url];
            if (uuid) {
                element.href = makeReferenceURL(uuid, useProtocol);
                if (blank)
                    element.setAttribute("target", "_blank");
            }
        });
}

function processIFrames(doc, siteMap, useProtocol) {
    doc.querySelectorAll("iframe").forEach(
        function (element) {
            const html = element.srcdoc;

            if (html) {
                const srcdoc = parseHtml(html);
                processIFrames(srcdoc, siteMap, useProtocol);
                installScrapyardURLs(srcdoc, siteMap, true, useProtocol);
                element.srcdoc = "<!DOCTYPE html>" + srcdoc.documentElement.outerHTML;
            }
            else if (element.contentWindow?.document) {
                processIFrames(element.contentWindow.document, siteMap, useProtocol);
                installScrapyardURLs(element.contentWindow.document, siteMap, true, useProtocol);
            }
        });
}

function configureSiteLinks(siteMap, useProtocol) {
    installScrapyardURLs(document, siteMap, false, useProtocol);
    processIFrames(document, siteMap, useProtocol);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
        case "CONFIGURE_SITE_LINKS":
            if (!configured) {
                configured = true;
                configureSiteLinks(message.siteMap, message.useProtocol);
            }
            break;
    }
});

console.log("content_site.js loaded")
