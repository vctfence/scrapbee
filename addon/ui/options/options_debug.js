import {settings} from "../../settings.js";

export function load() {
    $("a.settings-menu-item[href='#debug']").show();
}

export async function navigate(subsection) {
    await settings.load();

    if (subsection === "on")
        settings.debug_mode(true);
    else
        settings.debug_mode(false);
}
