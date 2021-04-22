import * as org from "./lib/org/org.js";

export function isIShell(id) {
    if (!id)
        return false;

    return /^ishell(:?-we)?@gchristensen.github.io$/.test(id);
}

export function partition(items, size) {
    var result = []
    var n = Math.round(items.length / size);

    while (items.length > 0)
        result.push(items.splice(0, n));

    return result;
}

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

export function showNotification(args) {
    if (typeof arguments[0] === "string")
        args = {message: arguments[0]}

    return browser.notifications.create(`sbi-notification-${args.type}`, {
        type: args.type? args.type: 'basic',
        title: args.title? args.title: 'Scrapyard',
        message: args.message,
        iconUrl: '/icons/scrapyard.svg'
    });
}

export async function getActiveTab() {
    const tabs = await browser.tabs.query({ lastFocusedWindow: true, active: true });
    return tabs && tabs.length? tabs[0]: null;
}

export async function openPage(url) {
    return browser.tabs.create({"url": url});
}

export async function openContainerTab(url, container) {
    try {
        return await browser.tabs.create({"url": url, cookieStoreId: container});
    }
    catch (e) {
        if (e.message?.includes("cookieStoreId"))
            showNotification("Invalid bookmark container.");

        return browser.tabs.create({"url": url});
    }
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

export function applyInlineStyles(element, recursive = true) {

    let matchRules = function(el, sheets) {
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

            element.style.setProperty(prop,val,priority);
        }
    });

    if (recursive) {
        Array.from(element.children).forEach(child => {
            applyInlineStyles(child, recursive);
        });
    }
}

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
            return org2html(notes.content);
    }
}

export async function computeSHA1(text) {
    return hexString(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text)));
}

export function hexString(buffer) {
    const byteArray = new Uint8Array(buffer);

    const hexCodes = [...byteArray].map(value => {
        const hexCode = value.toString(16);
        return hexCode.padStart(2, '0');
    });

    return hexCodes.join('');
}


export function isSpecialPage(url)
{
    return (url.substr(0,6) === "about:" || url.substr(0,7) === "chrome:"
        || url.substr(0,12) === "view-source:" || url.substr(0,14) === "moz-extension:"
        || url.substr(0,26) === "https://addons.mozilla.org" || url.substr(0,17) === "chrome-extension:"
        || url.substr(0,34) === "https://chrome.google.com/webstore");
}

export function notifySpecialPage() {
    showNotification("Scrapyard cannot be used with special pages:\n" +
        "about:, moz-extension:,\n" +
        "https://addons.mozilla.org,\n" +
        "chrome:, chrome-extension:,\n" +
        "https://chrome.google.com/webstore,\n" +
        "view-source:");
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

// Extracting signature:

// contentType = "";
// binaryString = "";
// let signature = [];
// for (i = 0; i < byteArray.byteLength; i++) {
//     if (i < 4)
//         signature.push(byteArray[i].toString(16));
//     binaryString += String.fromCharCode(byteArray[i]);
// }
//
// signature = signature.join("").toUpperCase();
// contentType = getMimetype(signature);

export function getMimetype (signature) {
    switch (signature) {
        case '89504E47':
            return 'image/png';
        case '47494638':
            return 'image/gif';
        case '25504446':
            return 'application/pdf';
        case 'FFD8FFDB':
        case 'FFD8FFE0':
            return 'image/jpeg';
        case '504B0304':
            return 'application/zip';
        case '3C737667':
            return 'image/svg+xml';
        default:
            return null;
    }
}

export function getMimetypeExt(url) {
    if (!url)
        return null;

    if (url.endsWith(".png"))
        return 'image/png';
    else if (url.endsWith(".gif"))
        return 'image/gif';
    else if (url.endsWith(".jpg") || url.endsWith(".jpeg"))
        return 'image/jpeg';
    else if (url.endsWith(".ico"))
        return 'image/x-icon';
    else if (url.endsWith(".svg"))
        return 'image/svg+xml';
    else if (url.endsWith(".webp"))
        return 'image/webp';
    else
        return null;
}

export async function testFavicon(url) {
    try {
        // get a nice favicon for wikipedia
        if (url.origin && url.origin.endsWith("wikipedia.org"))
            return "https://en.wikipedia.org/favicon.ico";

        let response = await fetch(url)
        if (response.ok) {
            let type = response.headers.get("content-type") || "image";
            //let length = response.headers.get("content-length") || "0";
            if (type.startsWith("image") /*&& parseInt(length) > 0*/)
                return url.toString();
        }
    }
    catch (e) {
        console.error(e);
    }

    return undefined;
}

export async function getFaviconFromTab(tab, tabOnly = false) {
    let favicon;
    let origin = new URL(tab.url).origin;

    if (!origin)
        return undefined;

    if (tab.favIconUrl)
        return tab.favIconUrl;
    else if (tabOnly)
        return null;

    try {
        let icon = await browser.tabs.executeScript(tab.id, {
            code: `document.querySelector("head link[rel*='icon'], head link[rel*='shortcut']")?.href`
        });

        if (icon && icon.length && icon[0])
            favicon = await testFavicon(new URL(icon[0], origin));
    } catch (e) {
        console.error(e);
    }

    if (!favicon)
        favicon = await testFavicon(new URL("/favicon.ico", origin));

    return favicon;
}

export function getFavicon(url, tryRootFirst = false, usePageOnly = false) {
    let load_url = (url, type, timeout = 10000) => {
        return new Promise((resolve, reject) => {
            let xhr = new XMLHttpRequest();
            xhr.open("GET", url);

            if (type)
                xhr.responseType = type;

            xhr.timeout = timeout;

            xhr.ontimeout = function () {
                reject();
            };
            xhr.onerror = function (e) {
                reject(e);
            };
            xhr.onload = function () {
                if (this.status === 200)
                    resolve({url: url, response: this.response, type: this.getResponseHeader("content-type")});
                else
                    reject();
            };
            xhr.send();
        });
    };

    let valid_favicon = r => {
        let valid_type = r.type? r.type.startsWith("image"): true;
        return r && r.response.byteLength && valid_type;
    };

    let extract_link = r => {
        if (r.response && r.response.querySelector) {
            let link = r.response.querySelector("head link[rel*='icon'], head link[rel*='shortcut']");
            if (link)
                return new URL(link.href, origin).toString();
        }
        return undefined;
    };

    let parsedUrl = new URL(url);

    // get a nice favicon for wikipedia
    if (parsedUrl.origin && parsedUrl.origin.endsWith("wikipedia.org"))
        return "https://en.wikipedia.org/favicon.ico";

    let default_icon = parsedUrl.origin + "/favicon.ico";
    let get_html_icon = () => load_url(url, "document").then(extract_link).catch (e => undefined);

    if (usePageOnly)
        return get_html_icon();

    if (tryRootFirst)
        return load_url(default_icon, "arraybuffer")
            .then(r => valid_favicon(r)? r: get_html_icon())
            .catch(get_html_icon);
    else
        return get_html_icon().then(r => r? r: load_url(default_icon, "arraybuffer").catch (e => undefined));
}

export async function packPage(url, bookmark, initializer, resolver, hide_tab) {
    return new Promise(async (resolve, reject) => {
        let completionListener = function (message, sender, sendResponse) {
            if (message.type === "STORE_PAGE_HTML" && message.bookmark.__tab_id === packingTab.id) {
                browser.tabs.onUpdated.removeListener(listener);
                browser.runtime.onMessage.removeListener(completionListener);
                browser.tabs.remove(packingTab.id);

                resolve(resolver(message));
            }
        };

        browser.runtime.onMessage.addListener(completionListener);

        let listener = async (id, changed, tab) => {
            if (id === packingTab.id && changed.status === "complete") {

                let initializationListener = async function (message, sender, sendResponse) {
                    if (message.type === "CAPTURE_SCRIPT_INITIALIZED" && sender.tab.id === packingTab.id) {
                        browser.runtime.onMessage.removeListener(initializationListener);

                        await initializer(bookmark, tab);
                        bookmark.__tab_id = packingTab.id;

                        try {
                            await browser.tabs.sendMessage(packingTab.id, {
                                type: "performAction",
                                menuaction: 1,
                                saveditems: 2,
                                bookmark: bookmark
                            });
                        } catch (e) {
                            console.error(e);
                            reject(e);
                        }
                    }
                };

                browser.runtime.onMessage.addListener(initializationListener);

                try {
                    try {
                        await browser.tabs.executeScript(tab.id, {
                            file: "savepage/content-frame.js",
                            allFrames: true
                        });
                    } catch (e) {
                        console.error(e);
                    }

                    await browser.tabs.executeScript(packingTab.id, {file: "savepage/content.js"});
                } catch (e) {
                    reject(e);
                }
            }
        };

        browser.tabs.onUpdated.addListener(listener);

        var packingTab = await browser.tabs.create({url: url, active: false});

        if (hide_tab)
            browser.tabs.hide(packingTab.id)
    });
}

// https://stackoverflow.com/a/34920444/1689848
export function stringByteLengthUTF8(s) {
    if (!s)
        return 0;

    //assuming the String is UCS-2(aka UTF-16) encoded
    var n = 0;
    for (var i = 0, l = s.length; i < l; i++) {
        var hi = s.charCodeAt(i);
        if (hi < 0x0080) { //[0x0000, 0x007F]
            n += 1;
        }
        else if (hi < 0x0800) { //[0x0080, 0x07FF]
            n += 2;
        }
        else if (hi < 0xD800) { //[0x0800, 0xD7FF]
            n += 3;
        }
        else if (hi < 0xDC00) { //[0xD800, 0xDBFF]
            var lo = s.charCodeAt(++i);
            if (i < l && lo >= 0xDC00 && lo <= 0xDFFF) { //followed by [0xDC00, 0xDFFF]
                n += 4;
            }
        }
        else { //[0xE000, 0xFFFF]
            n += 3;
        }
    }
    return n;
}

// // https://stackoverflow.com/a/18650828/1689848
// export function formatBytes(bytes, decimals = 2) {
//     if (bytes === 0) return '0 Bytes';
//
//     const k = 1024;
//     const dm = decimals < 0 ? 0 : decimals;
//     const sizes = ['Bytes', 'KB', 'MB', 'GB']; // :)
//
//     const i = Math.floor(Math.log(bytes) / Math.log(k));
//
//     return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
// }

export function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    let size = parseFloat((bytes / Math.pow(k, i)).toFixed(dm)).toString();

    let [int, dec] = size.split(".");

    if (int.length > 2)
        size = Math.round(parseFloat(size));
    else if (dec && int.length === 2)
        size = Math.round((parseFloat(size) * 10)) / 10;

    return size + ' ' + sizes[i];
}

export async function readFile(file) {
    let reader = new FileReader();

    return new Promise((resolve, reject) => {
        reader.onload = e => resolve(e.target.result);
        reader.onerror = e => reject(e);

        reader.readAsText(file);
    });
}

export function readBlob(blob, mode) {
    return new Promise((resolve, reject) => {
        let reader = new FileReader();
        reader.onloadend = () => {
            resolve(reader.result);
        };
        reader.onerror = e => {
            reject(e);
        };

        if (mode === "binarystring")
            reader.readAsBinaryString(blob);
        else if (mode === "binary")
            reader.readAsArrayBuffer(blob);
        else
            reader.readAsText(blob, "utf-8");
    });
}

export class ReadLine {
    /* options:
         chunk_size:          The chunk byte size. Default is 256K.
    */
    constructor(file, options) {
        this.file           = file;
        this.offset         = 0;
        this.fileSize       = file.size;
        this.decoder        = new TextDecoder();
        this.reader         = new FileReader();

        this.chunkSize  = !options || typeof options.chunk_size === 'undefined' ?  256 * 1024 : parseInt(options.chunk_size);
    }

    async *lines() {
        let remnantBytes;
        let remnantCharacters = "";

        for (let offset = 0; offset < this.fileSize; offset += this.chunkSize) {
            let chunk = await this.readChunk(offset);
            let bytes = new Uint8Array(chunk);
            let point = bytes.length - 1;
            let split = false;
            let remnant;

            if ((bytes[point] & 0b11000000) === 0b11000000)
                split = true;
            else {
                while (point && (bytes[point] & 0b11000000) === 0b10000000) {
                    point -= 1;
                }

                if (point !== bytes.length - 1)
                    split = true;
            }

            if (split) {
                remnant = bytes.slice(point);
                bytes = bytes.slice(0, point);

                if (remnantBytes) {
                    let newBytes = new Uint8Array(remnantBytes.length + bytes.length);
                    newBytes.set(remnantBytes);
                    newBytes.set(bytes, remnantBytes.length);
                    bytes = newBytes;
                }

                remnantBytes = remnant;
            }
            else {
                if (remnantBytes) {
                    let newBytes = new Uint8Array(remnantBytes.length + bytes.length);
                    newBytes.set(remnantBytes);
                    newBytes.set(bytes, remnantBytes.length);
                    bytes = newBytes;
                }

                remnantBytes = null;
            }

            let lines = this.decoder.decode(bytes).split("\n");

            if (lines.length === 1) {
                remnantCharacters = remnantCharacters + lines[0];
            }
            else if (lines.length) {
                if (remnantCharacters)
                    lines[0] = remnantCharacters + lines[0];

                remnantCharacters = lines[lines.length - 1];
                lines.length = lines.length - 1;

                yield* lines;
            }
        }

        yield remnantCharacters;
    }

    readChunk(offset) {
        return new Promise((resolve, reject) => {
            this.reader.onloadend = () => {
                resolve(this.reader.result);
            };
            this.reader.onerror = e => {
                reject(e);
            };

            this.reader.readAsArrayBuffer(this.file.slice(offset, offset + this.chunkSize));
        });
    }
}
