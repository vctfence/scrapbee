import {settings, SETTING_KEY} from "./settings.js"
import {backend} from "./backend.js"

window.onload=function(){
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();

    let darkStyle;

    /** help mark */
    $(".help-mark").hover(function(e){
        $(this).next(".tips.hide").show().css({left: (e.pageX )+"px", top: (e.pageY) +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });

    function switchPane(){
        $(".div-area").hide();
        $("a.left-index").removeClass("focus")

        let m;
        if(m = location.href.match(/#(\w+)$/)){
            $("#div-" + m[1]).show();
            $("a.left-index[href='#" + m[1] + "']").addClass("focus")
        }else{
            $("#div-settings").show();
            $("a.left-index[href='#settings']").addClass("focus")
        }
    }
    window.onhashchange = switchPane;
    switchPane();

    $("#copy-style-link").on("click", onCopyStyle);

    document.getElementById("options-save-button").addEventListener("click",onClickSave,false);
    
    let _ = (v, d) => {return v !== undefined? v: d;};

    chrome.storage.local.get("savepage-settings",
        function(object)
        {
            object = object["savepage-settings"];

            /* General options */

            // document.getElementById("options-newbuttonaction").elements["action"].value = object["options-newbuttonaction"];
            //
            // document.getElementById("options-showsubmenu").checked = object["options-showsubmenu"];
            //document.getElementById("options-showwarning").checked = _(object["options-showwarning"], true);
            ///document.getElementById("options-showurllist").checked = _(object["options-showurllist"], false);
            // document.getElementById("options-promptcomments").checked = object["options-promptcomments"];
            //
            // document.getElementById("options-usepageloader").checked = object["options-usepageloader"];
            document.getElementById("options-retaincrossframes").checked = _(object["options-retaincrossframes"], true);
            document.getElementById("options-removeunsavedurls").checked = _(object["options-removeunsavedurls"], true);
            // document.getElementById("options-includeinfobar").checked = object["options-includeinfobar"];
            // document.getElementById("options-includesummary").checked = object["options-includesummary"];
            // document.getElementById("options-formathtml").checked = object["options-formathtml"];
            //
            // document.getElementById("options-savedfilename").value = object["options-savedfilename"];
            // document.getElementById("options-replacespaces").checked = object["options-replacespaces"];
            // document.getElementById("options-replacechar").value = object["options-replacechar"];
            // document.getElementById("options-maxfilenamelength").value = object["options-maxfilenamelength"];
            //
            // document.getElementById("options-replacechar").disabled = !document.getElementById("options-replacespaces").checked;
            //
            // /* Saved Items options */
            //
            document.getElementById("options-savehtmlaudiovideo").checked = _(object["options-savehtmlaudiovideo"], true);
            document.getElementById("options-savehtmlobjectembed").checked = _(object["options-savehtmlobjectembed"], true);
            document.getElementById("options-savehtmlimagesall").checked = _(object["options-savehtmlimagesall"], true);
            document.getElementById("options-savecssimagesall").checked = _(object["options-savecssimagesall"], true);
            document.getElementById("options-savecssfontswoff").checked = _(object["options-savecssfontswoff"], true);
            document.getElementById("options-savecssfontsall").checked = _(object["options-savecssfontsall"], true);
            // document.getElementById("options-savescripts").checked = object["options-savescripts"];
            //
            document.getElementById("options-savecssfontswoff").disabled = document.getElementById("options-savecssfontsall").checked;
            //
            // /* Advanced options */
            //
            document.getElementById("options-maxframedepth").value = _(object["options-maxframedepth"], 5);
            document.getElementById("options-maxresourcesize").value = _(object["options-maxresourcesize"], 5);
            document.getElementById("options-maxresourcetime").value = _(object["options-maxresourcetime"], 10);
            document.getElementById("options-allowpassive").checked = _(object["options-allowpassive"], false);
            document.getElementById("options-refererheader").elements["header"].value = _(object["options-refererheader"], 0);
            document.getElementById("options-forcelazyloads").checked = _(object["options-forcelazyloads"], false);
            document.getElementById("options-purgeelements").checked = _(object["options-purgeelements"], false);
        });

         document.getElementById("options-savecssfontsall").addEventListener("click", function () {
         document.getElementById("options-savecssfontswoff").disabled = document.getElementById("options-savecssfontsall").checked;
    },false);

    settings.load(() => {
        document.getElementById("option-shallow-export").checked = settings.shallow_export();
        //document.getElementById("option-compress-export").checked = settings.compress_export();
        //document.getElementById("option-revoke-archive-url-after").value = settings.archive_url_lifetime();
        document.getElementById("option-switch-to-bookmark").checked = settings.switch_to_new_bookmark();
    });

    fetch("_locales/en/help.html").then(response => {
        return response.text();
    }).then(text => {
        $("#div-help").html(text);
    });

    fetch("shadowfox/userContent.css").then(response => {
        return response.text();
    }).then(text => {
        darkStyle = text.replace(/%%%/g, browser.runtime.getURL("/"));
    });

    function onClickSave(event)
    {
        chrome.storage.local.set({"savepage-settings":
            {
                /* General options */

                //"options-showwarning": document.getElementById("options-showwarning").checked,
                //"options-showurllist": document.getElementById("options-showurllist").checked,
                //"options-promptcomments": document.getElementById("options-promptcomments").checked,

                //"options-usepageloader": document.getElementById("options-usepageloader").checked,
                "options-retaincrossframes": document.getElementById("options-retaincrossframes").checked,
                "options-removeunsavedurls": document.getElementById("options-removeunsavedurls").checked,
                //"options-includeinfobar": document.getElementById("options-includeinfobar").checked,
                //"options-includesummary": document.getElementById("options-includesummary").checked,
                //"options-formathtml": document.getElementById("options-formathtml").checked,

                /* Saved Items options */

                "options-savehtmlaudiovideo": document.getElementById("options-savehtmlaudiovideo").checked,
                "options-savehtmlobjectembed": document.getElementById("options-savehtmlobjectembed").checked,
                "options-savehtmlimagesall": document.getElementById("options-savehtmlimagesall").checked,
                "options-savecssimagesall": document.getElementById("options-savecssimagesall").checked,
                "options-savecssfontswoff": document.getElementById("options-savecssfontswoff").checked,
                "options-savecssfontsall": document.getElementById("options-savecssfontsall").checked,
                //"options-savescripts": document.getElementById("options-savescripts").checked,

                /* Advanced options */

                "options-maxframedepth": +document.getElementById("options-maxframedepth").value,
                "options-maxresourcesize": +document.getElementById("options-maxresourcesize").value,
                "options-maxresourcetime": +document.getElementById("options-maxresourcetime").value,
                "options-allowpassive": document.getElementById("options-allowpassive").checked,
                "options-refererheader": +document.getElementById("options-refererheader").elements["header"].value,
                "options-forcelazyloads": document.getElementById("options-forcelazyloads").checked,
                "options-purgeelements": document.getElementById("options-purgeelements").checked
            }});


        settings.shallow_export(document.getElementById("option-shallow-export").checked);
        //settings.compress_export(document.getElementById("option-compress-export").checked);
        //settings.archive_url_lifetime(document.getElementById("option-revoke-archive-url-after").value);
        settings.switch_to_new_bookmark(document.getElementById("option-switch-to-bookmark").checked);


        /* Display saved status for short period */

        document.getElementById("options-save-button").value = "Saved";
        document.getElementById("options-save-button").style.setProperty("font-weight","bold","");

        setTimeout(function()
            {
                document.getElementById("options-save-button").value = "Save";
                document.getElementById("options-save-button").style.setProperty("font-weight","normal","");
            }
            ,1000);
    }

    function onCopyStyle(e) {
        navigator.clipboard.writeText(darkStyle);

    }


};
