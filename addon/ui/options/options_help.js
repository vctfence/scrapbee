import {fetchText} from "../../utils_io.js";
import {settings} from "../../settings.js";

function scrollToElement (subsection) {
    let element = document.getElementById(subsection);
    let offset = element.getBoundingClientRect();
    $("#div-help").prop("scrollTop", offset.top)
}

export async function load() {
    if ($("#div-help").is(":empty")) {
        let help = await fetchText("locales/en/help.html");
        help = help.replaceAll(`src="images/`, `src="locales/en/images/`);
        $("#div-help").html(help);
    }

    $("[id^='for-read-more-']").on("click", expandReadMore)

    if (settings.transition_to_disk())
        $(".transition-help-warning").show();
}

export function navigate(subsection) {
    $("#div-help").prop("scrollTop", 0)
    if (subsection) {
        setTimeout(() => scrollToElement(subsection), 500);
    }
}

function expandReadMore(evt) {
    const elt = $(evt.target).closest("a")[0];
    const divId = elt.id.replace(/^for-/, "");
    const div = document.getElementById(divId);
    evt.preventDefault();

    if (elt.id === "for-read-more-table-of-contents") {
        $("#read-more-table-of-contents").toc({content: "#help-content", prefix: "help:"});
        $("#help-content h1, #help-content h2, #help-content h3").append(" <a class='to-top' href='#'>&#x1F809;</a>");
        $(".to-top").on("click", e => {
            e.preventDefault();
            $("#div-help").prop("scrollTop", 0)
        });
    }

    div.style.display = "block";
    elt.parentElement.removeChild(elt);
}
