import {fetchWithTimeout} from "./utils_io.js";

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
    return String(string).replace(/[&<>"'`=\/]/g, s => entityMap[s]);
}

export function escapeCSS(string) {
    return String(string).replace(/[<>]/g, s => entityMap[s]);
}

export function unescapeHtml(string) {
    return string.replace(/&amp;/g, '&')
                 .replace(/&quot;/g, '\"')
                 .replace(/&lt;/g, '<')
                 .replace(/&gt;/g, '>')
                 .replace(/&nbsp;/g, ' ')
                 .replace(/&#39;/g, "'");
}

export function parseHtml(htmlText) {
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
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
}

export function injectCSS(file) {
    let link = document.querySelector(`link[href="${file}]"`)
    if (!link) {
        link = document.createElement("link");
        link.rel = "stylesheet";
        link.type = "text/css";
        link.href = file;
        link.media = "all";
        document.head.appendChild(link);
    }
}

export function getThemeVar(v) {
    let vars = document.querySelector(":root");
    if (vars) {
        let style = window.getComputedStyle(vars);
        return style.getPropertyValue(v);
    }
}

export function applyInlineStyles(element, recursive = true, exclude) {

    let matchRules = function (el) {
        let sheets = Array.from(document.styleSheets);
        if (exclude)
            sheets = sheets.filter(s => !exclude.some(e => s.href?.endsWith(e)));
        let ret = [];
        for (let sheet of sheets) {
            let rules = sheet.rules || sheet.cssRules;
            for (let r in rules) {
                if (rules[r].selectorText?.includes("*"))
                    continue;
                if (el.localName === "pre" && el.matches(rules[r].selectorText)) {
                    log(rules[r].selectorText)
                }
                if (el.matches(rules[r].selectorText)) {
                    ret.push(rules[r]);
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
            applyInlineStyles(child, recursive, exclude);
        });
    }
}

export function indexString(string) {
    return createIndex(string, t => t);
}

export function indexHTML(string) {
    const textExtractor = _BACKGROUND_PAGE
        ? extractTextRecursive
        : removeTags;

    return createIndex(string, textExtractor)
}

function createIndex(string, textExtractor) {
    try {
        string = textExtractor(string);
        string = string.replace(/\n/g, ' ')
            .replace(/(?:\p{Z}|[^\p{L}-])+/ug, ' ');

        let words = string.split(" ")
            .filter(s => s && s.length > 2)
            .map(s => s.toLocaleLowerCase())

        return Array.from(new Set(words));
    }
    catch (e) {
        console.error(e)
        console.log("Index creation has failed.")
        return [];
    }
}

function extractTextRecursive(string, parser) {
    if (!parser)
        parser = new DOMParser();

    const doc = parser.parseFromString(string,"text/html");
    removeScriptTags(doc);

    let text = doc.body.textContent;

    doc.querySelectorAll("iframe").forEach(
        function (element) {
            const html = element.srcdoc;
            if (html)
                text += " " + extractTextRecursive(html, parser);
        });

    return text;
}

function removeTags(string) {
    return string.replace(/<iframe[^>]*srcdoc="([^"]*)"[^>]*>/igs, (m, d) => d)
        .replace(/<title.*?<\/title>/igs, "")
        .replace(/<style.*?<\/style>/igs, "")
        .replace(/<script.*?<\/script>/igs, "")
        .replace(/&[0-9#a-zA-Z]+;/igs, ' ')
        .replace(/<[^>]+>/gs, ' ');
}

function removeScriptTags(doc) {
    $("body script", doc).remove();
    $("body style", doc).remove();
}

export async function isHTMLLink(url, timeout = 10000) {
    let response;
    try {
        response = await fetchWithTimeout(url, {method: "head"});
    } catch (e) {
        console.error(e);
    }

    if (response?.ok) {
        const contentType = response.headers.get("content-type");
        return !!(contentType && contentType.toLowerCase().startsWith("text/html"));
    }
}

export class RDFNamespaces {
    //NS_NC;
    NS_RDF;
    NS_SCRAPBOOK;

    resolver;

    constructor(doc) {
        const rootAttrs = Object.values(doc.documentElement.attributes);
        const namespaces = rootAttrs.map(a => [a.localName, a.prefix === "xmlns"? a.value: null]);
        const namespaceMap = new Map(namespaces);
        this.resolver = ns => namespaceMap.get(ns);

        //this.NS_NC = this.resolver("NC");
        this.NS_RDF = this.resolver("RDF");
        this.NS_SCRAPBOOK = namespaces.find(ns => (/NS\d+/i).test(ns[0]))[1];
    }
}
