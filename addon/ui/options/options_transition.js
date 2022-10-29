import {confirm} from "../dialog.js";
import {settings} from "../../settings.js";

export function load() {
    $("#disable-transition").on("click", async e => {
        e.preventDefault();

        if (await confirm("Warning", "This will restart Scrapyard. Continue?")) {
            settings.storage_mode_internal(true, false);
            await settings.transition_to_disk(false);
            browser.runtime.reload();
        }
    });
}
