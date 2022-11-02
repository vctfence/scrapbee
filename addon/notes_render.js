import {escapeCSS, escapeHtml} from "./utils_html.js";
import * as org from "./lib/org/org.js";
import {marked} from "./lib/marked.js";

export function org2html(org_text, toc) {
    const doc = new org.Parser().parse(org_text);

    if (toc)
        doc.options.toc = true;

    const html = new org.ConverterHTML(doc).result;

    let output = doc.directiveValues["css:"]
        ? `<style>${escapeCSS(doc.directiveValues["css:"])}</style>`
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
        ? `<style>${escapeCSS(css)}</style>`
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
        ? `<style>${escapeCSS(css)}</style>`
        : "";

    if (css)
        text = text.replace(firstLine, "");

    output += `<pre class="plaintext">${escapeHtml(text)}</pre>`

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
                return org2html(notes.content, notes.__generate_toc);
            return "";
    }
}
