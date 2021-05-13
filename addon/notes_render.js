import * as org from "./lib/org/org.js";

export function org2html(org_text) {
    let doc = new org.Parser().parse(org_text);
    let html = new org.ConverterHTML(doc).result;

    let output = doc.directiveValues["css:"]
        ? `<style>${doc.directiveValues["css:"].htmlEncode(true, true)}</style>`
        : "";

    if (doc.options.toc) {
        output += html.tocHTML.replace("<ul", "<ul id='toc'") + html.contentHTML;
    }
    else
        output += html.contentHTML;

    return output;
}

export function markdown2html(md_text) {
    md_text = md_text || "";

    let m = /^(.*?\r?\n)/.exec(md_text);
    let firstLine;
    let css;

    if (m && m[1]) {
        firstLine = m[1];
        m = /\[\/\/]: # \((.*?)\)$/.exec(firstLine.trim());

        if (m && m[1])
            css = m[1];
    }

    let output = css
        ? `<style>${css.htmlEncode(true, true)}</style>`
        : "";

    output += marked(md_text);

    return output;
}

export function text2html(text) {
    text = text || "";
    let m = /^(.*?\r?\n)/.exec(text);
    let firstLine;
    let css;

    if (m && m[1]) {
        firstLine = m[1];
        m = /CSS:(.*?)$/.exec(firstLine.trim());

        if (m && m[1])
            css = m[1];
    }

    let output = css
        ? `<style>${css.htmlEncode(true, true)}</style>`
        : "";

    if (css)
        text = text.replace(firstLine, "");

    output += `<pre class="plaintext">${text.htmlEncode()}</pre>`

    return output;
}

export function notes2html(notes) {
    switch (notes.format) {
        case "text":
            return text2html(notes.content);
        case "markdown":
            return markdown2html(notes.content);
        case "html":
            return notes.content;
        case "delta":
            return notes.html;
        case "org":
        default:
            if (notes?.content)
                return org2html(notes.content);
            return "";
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
