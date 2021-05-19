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

export function clearDocumentEncoding(doc) {
    let meta = doc.querySelector("meta[http-equiv='content-type' i]")
        || doc.querySelector("meta[charset]");

    if (meta)
        meta.parentNode.removeChild(meta);
}

export function fixDocumentEncoding(doc) {
    clearDocumentEncoding(doc);
    $(doc.getElementsByTagName("head")[0]).prepend(`<meta charset="utf-8">`);
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

export function applyInlineStyles(element, recursive = true) {

    let matchRules = function (el, sheets) {
        sheets = sheets || document.styleSheets;
        let ret = [];
        for (let i in sheets) {
            if (sheets.hasOwnProperty(i)) {
                let rules = sheets[i].rules || sheets[i].cssRules;
                for (let r in rules) {
                    if (rules[r].selectorText?.includes("*"))
                        continue;
                    if (el.matches(rules[r].selectorText)) {
                        ret.push(rules[r]);
                    }
                }
            }
        }
        return ret;
    }

    const matches = matchRules(element);

    // we need to preserve any pre-existing inline styles.
    let srcRules = document.createElement(element.tagName).style;
    srcRules.cssText = element.style.cssText;

    matches.forEach(rule => {
        for (let prop of rule.style) {

            let val = srcRules.getPropertyValue(prop) || rule.style.getPropertyValue(prop);
            let priority = rule.style.getPropertyPriority(prop);

            element.style.setProperty(prop, val, priority);
        }
    });

    if (recursive) {
        Array.from(element.children).forEach(child => {
            applyInlineStyles(child, recursive);
        });
    }
}
