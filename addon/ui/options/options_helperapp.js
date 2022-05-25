import {fetchWithTimeout} from "../../utils_io.js";
import {send} from "../../proxy.js";

async function loadHelperAppLinks() {
    const helperAppVersionP = $("#helper-app-version");
    if (helperAppVersionP.data("loaded"))
        return;

    helperAppVersionP.data("loaded", true);

    function setDownloadLinks(link1, link2) {
        const app = link1.endsWith(".exe")? link1: link2;
        const archive = link1.endsWith(".zip")? link1: link2;
        $("#helper-windows-inst").attr("href", app);
        $("#helper-manual-inst").attr("href", archive);
    }

    try {
        const apiURL = "https://api.github.com/repos/gchristensen/scrapyard/releases/latest";
        const response = await fetchWithTimeout(apiURL, {timeout: 30000});

        if (response.ok) {
            let release = JSON.parse(await response.text());
            setDownloadLinks(release.assets[0].browser_download_url, release.assets[1].browser_download_url);

            let version = release.name.split(" ");
            version = version[version.length - 1];

            helperAppVersionP.html(`<b>Latest version:</b> ${version}`);
        }
        else
            throw new Error();
    }
    catch (e) {
        console.error(e);
        setDownloadLinks("#heperapp", "#heperapp");
        helperAppVersionP.html(`<b>Latest version:</b> error`);
    }

    const installedVersion = await send.helperAppGetVersion();
    const INSTALLED_VERSION_TEXT = `<b>Installed version:</b> %%%`;

    if (installedVersion)
        $("#helper-app-version-installed").html(INSTALLED_VERSION_TEXT
            .replace("%%%", "v" + installedVersion));
    else
        $("#helper-app-version-installed").html(INSTALLED_VERSION_TEXT
            .replace("%%%", "not installed"));
}

export async function load() {
    loadHelperAppLinks();
}
