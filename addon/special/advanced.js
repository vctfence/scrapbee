import {settings} from "/settings.js";
import {nativeBackend} from "/backend_native.js";

function initHelpMarks() {
    $(".help-mark").hover(function(e){
        $(this).next(".tips.hide").show().css({left: (e.pageX )+"px", top: (e.pageY) +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });
}

async function configureDBPath() {
    let helperApp = await nativeBackend.probe();

    if (!helperApp)
        return;

    const addonId = browser.runtime.getURL("/").split("/")[2];
    const url = `http://localhost:${settings.helper_port_number()}/request/idb_path/${addonId}`;

    const response = await fetch(url);

    if (response.ok) {
        const idbPath = await response.text();
        $("#addon-db-path-input").val(idbPath);
        $("#db-path-panel").show();
    }

    $("#db-path-copy-button").on("click", e => {
        navigator.clipboard.writeText($("#addon-db-path-input").val());
    });
}

function configureAutomationPanel() {
    settings.load(settings => {

        $("#option-enable-automation").prop("checked", settings.enable_automation());
        $("#option-extension-whitelist").val(settings.extension_whitelist()?.join(", "));

        $("#option-enable-automation").on("change", e => {
            console.log(e.target.checked)
            console.log(settings)
            settings.enable_automation(e.target.checked);
        });

        $("#option-extension-whitelist").on("input", e => {
            if (e.target.value) {
                let ids = e.target.value.split(",").map(s => s.trim()).filter(s => !!s);
                if (ids.length)
                    settings.extension_whitelist(ids);
                else
                    settings.extension_whitelist(null);
            }
            else
                settings.extension_whitelist(null);
        });
    });
}

window.onload = async function() {
    initHelpMarks();
    configureAutomationPanel();
    configureDBPath();
}
