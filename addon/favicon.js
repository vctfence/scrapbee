import {settings} from "./settings.js";
import {fetchWithTimeout} from "./utils_io.js";
import {parseHtml} from "./utils_html.js";
import {injectScriptFile} from "./utils_browser.js";

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
    } catch (e) {
        console.error(e);
    }
}

export async function getFaviconFromTab(tab, tabOnly = false) {
    let favicon;
    let origin = new URL(tab.url).origin;

    if (!origin)
        return undefined;

    if (tab.favIconUrl)
        return tab.favIconUrl;
    else if (tabOnly)
        return undefined;

    try {
        let icon = await injectScriptFile(tab.id, {file: "/content_favicon.js"});

        if (icon && icon.length && icon[0]) // TODO: leave only .result in MV3
            favicon = await testFavicon(new URL(icon[0].result || icon[0], origin));
    } catch (e) {
        console.error(e);
    }

    if (!favicon)
        favicon = await testFavicon(new URL("/favicon.ico", origin));

    return favicon;
}

export async function getFaviconFromContent(url, doc) {
    if (!doc) {
        let timeout = settings.link_check_timeout()? settings.link_check_timeout() * 1000: 10000;
        try {
            const response = await fetchWithTimeout(url, {timeout});
            if (response.ok) {
                if (_BACKGROUND_PAGE)
                    doc = parseHtml(await response.text());
                else
                    doc = await response.text();
            }
        }
        catch (e) {}
    }
    else if (_BACKGROUND_PAGE && typeof doc === "string")
        doc = parseHtml(doc);

    let favIcon;

    try {
        if (typeof doc === "string") {
            const linkTag = doc.match(/<link[^>]*rel=['"](?:icon|shortcut)[^>]*>/i)?.[0];
            if (linkTag)
                favIcon = linkTag.match(/href=['"]?([^'" ]+)/i)?.[1];
        }
        else {
            const faviconElt = doc.querySelector("link[rel*='icon'], link[rel*='shortcut']");
            if (faviconElt)
                favIcon = faviconElt.href;
        }
    }
    catch (e) {
        console.error(e);
    }

    const origin = new URL(url).origin;
    return favIcon && await testFavicon(new URL(favIcon, origin)) || await testFavicon(new URL("/favicon.ico", origin));
}
