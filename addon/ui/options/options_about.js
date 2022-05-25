import {fetchText} from "../../utils_io.js";

export async function load() {
    $("#about-changes").html(await fetchText("options/options_changes.html"));
    $("#about-version").text(`Version: ${browser.runtime.getManifest().version}`);

    $("#donation-links").on("mouseenter", e => $("#scrapyard-logo").prop("src", "../images/donation_kitty.png"));
    $("#donation-links").on("mouseleave", e => $("#scrapyard-logo").prop("src", "../icons/scrapyard.svg"));
}
