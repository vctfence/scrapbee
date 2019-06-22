export async function scriptsAllowed(tabId, frameId = 0) {
    try {
        await browser.tabs.executeScript(tabId, {
            frameId: frameId,
            runAt: 'document_start',
            code: 'true;'
        });
        return true;
    } catch (e) {}
}

export function showNotification({message, title='Scrapyard', type = 'info'}) {
    return browser.notifications.create(`sbi-notification-${type}`, {
        type: 'basic',
        title: title,
        message: message,
        iconUrl: '/icons/scrapyard.svg'
    });
}

export function pathToNameExt(fullPath) {

    let startIndex = (fullPath.indexOf('\\') >= 0 ? fullPath.lastIndexOf('\\') : fullPath.lastIndexOf('/'));
    let dotIndex = fullPath.lastIndexOf('.');
    let file_name = fullPath.substring(startIndex, dotIndex);
    let file_ext = fullPath.substring(dotIndex + 1);

    if (file_name.indexOf('\\') === 0 || file_name.indexOf('/') === 0) {
        file_name = file_name.substring(1);
    }

    return {name: file_name, ext: file_ext};
}

var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
};

export function escapeHtml (string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
        return entityMap[s];
    });
}


export function parseHtml(htmlText) {
    let doc = document.implementation.createHTMLDocument("");
    let doc_elt = doc.documentElement;
    let first_elt;

    doc_elt.innerHTML = htmlText;
    first_elt = doc_elt.firstElementChild;

    if (doc_elt.childElementCount === 1
        && first_elt.localName.toLowerCase() === "html") {
        doc.replaceChild(first_elt, doc_elt);
    }

    return doc;
}


export function isElementInViewport (el) {

    //special bonus for those using jQuery
    if (typeof jQuery === "function" && el instanceof jQuery) {
        el = el[0];
    }

    var rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && /*or $(window).height() */
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) /*or $(window).width() */
    );
}
