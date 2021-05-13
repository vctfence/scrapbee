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

export function escapeHtml(string) {
    return String(string).replace(/[&<>"'`=\/]/g, function (s) {
        return entityMap[s];
    });
}

// export function parseHtml(htmlText) {
//     let doc = document.implementation.createHTMLDocument("");
//     let doc_elt = doc.documentElement;
//
//     htmlText = htmlText.replace(/^.*?<html[^>]*>/is, "");
//     htmlText = htmlText.replace(/<\/html>.*?$/is, "");
//
//     doc_elt.innerHTML = htmlText;
//
//     return doc;
// }

export function parseHtml(htmlText) {
    var doc = document.implementation.createHTMLDocument("")
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

export function fixDocumentEncoding(doc) {
    let chars = doc.querySelector("meta[http-equiv='Content-Type'], meta[http-equiv='content-type']");
    if (chars) {
        chars.parentNode.removeChild(chars);
        chars.setAttribute("content", "text/html; charset=utf-8");
        doc.getElementsByTagName("head")[0].prepend(chars);
    }
    else {
        chars = doc.querySelector("meta[charset]");

        if (chars) {
            chars.parentNode.removeChild(chars);
            chars.setAttribute("charset", "utf-8");
            doc.getElementsByTagName("head")[0].prepend(chars);
        }
        else {
            chars = document.createElement("meta");
            chars.setAttribute("http-equiv", 'Content-Type');
            chars.setAttribute("content", "text/html; charset=utf-8");
            doc.getElementsByTagName("head")[0].prepend(chars);
        }
    }
}

export function isElementInViewport(el) {
    var rect = el.getBoundingClientRect();

    return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) && /*or $(window).height() */
        rect.right <= (window.innerWidth || document.documentElement.clientWidth) /*or $(window).width() */
    );
}

export function getThemeVar(v) {
    let vars = document.querySelector(":root");
    if (vars) {
        let style = window.getComputedStyle(vars);
        let value = style.getPropertyValue(v);
        return value;
    }
}
