import {fetchText} from "../../utils_io.js";
import {settings} from "../../settings.js";

export async function load() {
    $("#about-changes").html(await fetchText("options/options_changes.html"));
    $("#about-version").text(`Version: ${browser.runtime.getManifest().version}`);

    $(".donation-link").on("mouseenter", e => $("#scrapyard-logo").prop("src", "../images/donation_kitty.png"));
    $(".donation-link").on("mouseleave", e => $("#scrapyard-logo").prop("src", "../icons/scrapyard.svg"));

    if (settings.transition_to_disk())
        $("#transition-manual-wrapper").css("display", "inline");
}
