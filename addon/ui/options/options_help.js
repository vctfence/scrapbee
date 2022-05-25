import {fetchText} from "../../utils_io.js";

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
}

export function navigate(subsection) {
    $("#div-help").prop("scrollTop", 0)
    if (subsection)
        setTimeout(() => scrollToElement(subsection), 500);
}
