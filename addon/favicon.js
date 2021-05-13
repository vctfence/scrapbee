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
        let valid_type = r.type ? r.type.startsWith("image") : true;
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
    let get_html_icon = () => load_url(url, "document").then(extract_link).catch(e => undefined);

    if (usePageOnly)
        return get_html_icon();

    if (tryRootFirst)
        return load_url(default_icon, "arraybuffer")
            .then(r => valid_favicon(r) ? r : get_html_icon())
            .catch(get_html_icon);
    else
        return get_html_icon().then(r => r ? r : load_url(default_icon, "arraybuffer").catch(e => undefined));
}
