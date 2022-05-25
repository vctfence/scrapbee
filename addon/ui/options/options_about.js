import {fetchText} from "../../utils_io.js";

export async function load() {
    $("#about-changes").html(await fetchText("options/options_changes.html"));
    $("#about-version").text(`Version: ${browser.runtime.getManifest().version}`);
}
