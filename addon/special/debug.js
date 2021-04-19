import {settings} from "/settings.js";
import {nativeBackend} from "/backend_native.js";


function initHelpMarks() {
    $(".help-mark").hover(function(e){
        $(this).next(".tips.hide").show().css({left: (e.pageX )+"px", top: (e.pageY) +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });
}

async function configureDebugPage() {
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

window.onload = async function() {

    initHelpMarks();
    configureDebugPage();

}
