import {settings} from "./settings.js";


function initHelpMarks() {
    $(".help-mark").hover(function(e){
        $(this).next(".tips.hide").show().css({left: (e.pageX )+"px", top: (e.pageY) +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });
}

window.onload = async function() {

    initHelpMarks();

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
