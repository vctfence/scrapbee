import {settings} from "../settings.js"
import {fetchText} from "../utils_io.js";
import {injectCSS} from "../utils_html.js";
import {systemInitialization} from "../bookmarks_init.js";

window.onload = async function() {
    await systemInitialization;

    window.onhashchange = switchPane;
    switchPane();

    // show settings
    $("#settings-container").css("display", "flex");

    if (settings.debug_mode())
        $("a.settings-menu-item[href='#debug']").show();
};

async function switchPane() {
    $(".settings-content").hide();
    $("a.settings-menu-item").removeClass("focus")

    let hash = location.hash?.substr(1) || "settings";
    let [moduleName, subsection] = hash.split(":");
    let module = await loadOptionsModule(moduleName);

    $("#div-" + moduleName).show();
    $("a.settings-menu-item[href='#" + moduleName + "']").addClass("focus");

    if (subsection)
        module.navigate(subsection);
}

async function loadOptionsModule(moduleName) {
    const moduleDiv = $(`#div-${moduleName}`);

    let module = moduleDiv.data("module");
    if (!module) {
        injectCSS(`options/options_${moduleName}.css`)
        try {
            let html = await fetchText(`options/options_${moduleName}.html`);
            moduleDiv.html(html);
        }
        catch (e) {
            console.info(e)
        }
        module = await import(`./options/options_${moduleName}.js`);
        moduleDiv.data("module", module);
        initHelpMarks(`#div-${moduleName}`);
        await module.load();
    }

    return module;
}

function initHelpMarks(container = "") {
    $(`${container} .help-mark`).hover(function(e){
        $(this).next(".tips.hide").show().css({left: (e.pageX )+"px", top: (e.pageY) +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });
}

export async function setSaveCheckHandler(id, setting, callback) {
    await settings.load();
    $(`#${id}`).on("click", async e => {
        await settings[setting](e.target.checked);
        if (callback)
            return callback(e);
    });
}

export async function setSaveSelectHandler(id, setting) {
    await settings.load();
    $(`#${id}`).on("change", e => settings[setting](e.target.value));
}
