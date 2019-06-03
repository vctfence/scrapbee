import {settings} from "./settings.js"
import {log} from "./message.js"
import {initMover} from "./tools.js"

function getAsync(file) {
    var r;
    var z, i, elmnt, file, xhttp;
    xhttp = new XMLHttpRequest();
    xhttp.onreadystatechange = function() {
        if (this.readyState == 4) {
            if (this.status == 200) {
                r=this.response;
            }
            if (this.status == 404) {}
        }
    }
    xhttp.open("GET", file, false); // async
    xhttp.send();
    return r;
}
window.onload=async function(){
    await settings.loadFromStorage();
    var lang = "en";
    var ui = browser.i18n.getUILanguage();
    if(["en", "zh-CN"].indexOf(ui) > -1){
        lang = ui;
    }
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();
    $("#div-help").html(getAsync("_locales/" + lang + "/help.html"))
    /** mover */
    browser.runtime.sendMessage({type: 'GET_BACKEND_VERSION'}).then((version) => {
        if(version=='1.7.0')
            initMover();
    });
    /** help mark */
    $(".help-mark, .warn-mark").hover(function(e){
        var parentOffset = $(this).parent().offset(); 
        var relX = e.pageX - parentOffset.left;
        var relY = e.pageY - parentOffset.top;
        $(this).next(".tips.hide").show().css({left: relX+"px", top: relY +"px"})
    }, function(){
        $(this).next(".tips.hide").hide();
    });
    /** more donation */
    if($.trim($("#divMoreDonateWay>div").text())){
        $("#divMoreDonateWay").show()
        $("#divMoreDonateWay>a").click(function(){
            $("#divMoreDonateWay>div").toggle();
            return false;
        });
    }
    $("input[name='add']").click(function(){
        createRdfField("", "");
    });
    function createRdfField(k, v){
        var NAME_I18N = browser.i18n.getMessage("Name");
        var FILE_I18N = browser.i18n.getMessage("File");
        var $el = $(`<div class='rdf-row'>${NAME_I18N} <input type="text" name="name"/> \
${FILE_I18N} <input type="text" name="value"/> \
<input type="button" name="move" value="↑" /> <input type="button" name="move" value="↑" /> <input type="button" name="move" value="↓" /> <input type="button" name="del" value="-" /></div>`).appendTo($("#rdf-area"));
        $el.find("input[name=name]").val(k);
        $el.find("input[name=value]").val(v);
        $el.find("input[name=del]").click(function(){
            $(this).parent().remove();
        });
        $el.find("input[name=move]").click(function(){
            var up = (this.value == '↑');
            var $you;
            var $p = $(this).parent();
            if(up){
                $you = $p.prev(".rdf-row");
                if($you)$you.before($p);
            }else{
                $you = $p.next(".rdf-row");
                if($you)$you.after($p);
            }
        });
    }
    $("input[name='save']").click(function(){
        try{
            var names=[];
            var paths=[];
            $("#rdf-area div input:first-child").each(function(){
                var t = $.trim(this.value);
                names.push(t+"\n");
                paths.push($.trim($(this).next("input").val())+"\n");
            });
            settings.set('rdf_paths', paths.join(""), true);
            settings.set('rdf_path_names', names.join(""), true);
            settings.set('backend_port', $("input[name=backend_port]").val(), true);
            settings.set('bg_color', $("input[name=bg_color]").val().replace("#", ""), true);
            settings.set('font_color', $("input[name=font_color]").val().replace("#", ""), true);
            settings.set('separator_color', $("input[name=separator_color]").val().replace("#", ""), true);
            settings.set('bookmark_color', $("input[name=bookmark_color]").val().replace("#", ""), true);
            settings.set('selection_color', $("input[name=selection_color]").val().replace("#", ""), true);
            var size = (parseInt($("input[name=font_size]").val() / 5) * 5) / 100 * 12;
            settings.set('font_size', size, true);
            settings.set('line_spacing', $("input[name=line_spacing]").val(), true);
            settings.set('open_in_current_tab', $("input[name=open_in_current_tab]").is(":checked")?"on":"off", true);
            $(this).next("span").fadeIn().fadeOut();
        }catch(e){
            alert("Save failed")
        }
    });
    var paths = settings.getRdfPaths();
    if(paths){
        settings.getRdfPathNames().forEach(function(k, i){
            createRdfField(k, paths[i]);
        });
    }
    $("input[name=font_size]").bind("input", function(){ // bind 'input' instead of 'change' event
        $(this).next("span").text((parseInt(this.value / 5) * 5) +"%");
    });
    $("input[name=line_spacing]").bind("input", function(){ // bind 'input' instead of 'change' event
        $(this).next("span").text(parseInt(this.value));
    });
    $("input[name=bg_color]").val(settings.bg_color.replace("#", ""));
    $("input[name=font_color]").val(settings.font_color.replace("#", ""));
    $("input[name=separator_color]").val(settings.separator_color.replace("#", ""));
    $("input[name=bookmark_color]").val(settings.bookmark_color.replace("#", ""));
    $("input[name=font_size]").val((settings.font_size / 12) * 100).trigger("input");
    $("input[name=line_spacing]").val(settings.line_spacing).trigger("input");
    $("input[name=backend_port]").val(settings.backend_port);
    $("input[name=selection_color]").val(settings.selection_color);
    $("input[name=open_in_current_tab]").prop("checked", settings.open_in_current_tab=="on")
    if(settings.backend_path){
        $("#txtBackendPath").show();
        $("#txtBackendPath").html("{ALREADY_DOWNLOADED_TO}: ".translate() + settings.backend_path);
    }
    jscolor.installByClassName("jscolor");
    function applyArea(){
        $(".div-area").hide();
        $("a.left-index").removeClass("focus")
        var m;
        if(m=location.href.match(/#(\w+)$/)){
            $("#div-"+m[1]).show();
            $("a.left-index[href='#" + m[1] + "']").addClass("focus")
        }else{
            $("#div-settings").show();
            $("a.left-index[href='#settings']").addClass("focus")
        }
    }
    window.onhashchange=()=>applyArea();
    applyArea()
    $("#donate").click(()=>window.open('http://PayPal.me/VFence', '_blank'));
    $("#btnDownloadBackend").click(function(){
        function Next(){
            const extRoot = "moz-extension://" + settings.extension_id;
            // var binDir = extRoot + "/bin/"
            var binDir = "https://raw.githubusercontent.com/vctfence/scrapbee_backend/master/" //scrapbee_backend.exe
            var src_exec = "scrapbee_backend";
            if(settings.platform=="mac")
                src_exec += "_mac"
            else if(settings.platform=="linux")
                src_exec += "_lnx"
            src_exec += settings.platform=="windows"?".exe":"";
            var dest_exec = "scrapbee_backend" + (settings.platform=="windows"?".exe":"");
            /** download backend executable */
            downloadFile(binDir + src_exec, "scrapbee/" + dest_exec, function(id){
                /*** query really filename of backend executable */
                browser.downloads.search({id: id}).then((downloads) => {
                    var filename = downloads[0].filename;
                    var json = {"allowed_extensions":["scrapbee@scrapbee.org"],
                                "description":"Scrapbee backend",
                                "name":"scrapbee_backend",
                                "path":filename, /** path to downloaded backend executable */
                                "type":"stdio"}
                    /*** download json */
                    var jstr = JSON.stringify(json, null, 2)
                    downloadText(jstr, "scrapbee/scrapbee_backend.json", function(){
                        var download_path = filename.replace(/[^\\\/]*$/,"");
                        function done(){ /** download installation script done */
                            settings.set('backend_path', download_path);
                            if(settings.backend_path){
                                $("#txtBackendPath").html("{ALREADY_DOWNLOADED_TO}: ".translate() + settings.backend_path);
                            }
                        }
                        /** download installation script */
                        if(settings.platform=="windows")
                            downloadText(installBat(download_path), "scrapbee/install.bat", done);
                        else if(settings.platform=="mac")
                            downloadFile(extRoot + "/install/install_mac.sh", "scrapbee/install.sh", done);
                        else
                            downloadFile(extRoot + "/install/install_lnx.sh", "scrapbee/install.sh", done);
                    });
                });
            });
        }
        $("#txtBackendPath").show();
        $("#txtBackendPath").html("Downloading...") // todo: error output
        setTimeout(Next, 1000);
    });
    function installBat(backend_path){
        return `chcp 65001\r\n\r
reg delete "HKEY_LOCAL_MACHINE\\SOFTWARE\\Mozilla\\NativeMessagingHosts\\scrapbee_backend" /f\r
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\Mozilla\\NativeMessagingHosts\\scrapbee_backend" /d "${backend_path}\scrapbee_backend.json" /f\r\n\r
reg delete "HKEY_CURRENT_USER\\Software\\Mozilla\\NativeMessagingHosts\\scrapbee_backend" /f\r
reg add "HKEY_CURRENT_USER\\Software\\Mozilla\\NativeMessagingHosts\\scrapbee_backend" /d "${backend_path}\scrapbee_backend.json" /f\r\n\r
echo done\r
pause`
    }
    function downloadFile(src, dest, callback){
        browser.downloads.download({
            url:src,
            filename: dest,
            conflictAction: "overwrite",
            saveAs: false
        }).then(function(id){
            var fn = function(downloadDelta){
                if(downloadDelta.id == id && (downloadDelta.state && downloadDelta.state.current == "complete")){
                    callback && callback(id)
                    browser.downloads.onChanged.removeListener(fn);
                }
            }
            browser.downloads.onChanged.addListener(fn);
        }).catch(function (error) {
            $("#txtBackendPath").html("error: " + error);
        });
    }
    function downloadText(text, filename, callback){
        var blob = new Blob([text], {type : 'text/plain'});
        var objectURL = URL.createObjectURL(blob);
        browser.downloads.download({
            url:objectURL,
            filename: filename,
            conflictAction: "overwrite",
            saveAs: false
        }).then(function(id){
            var fn = function(downloadDelta){
                if(downloadDelta.id == id && (downloadDelta.state && downloadDelta.state.current == "complete")){
                    callback && callback(id)
                    URL.revokeObjectURL(objectURL);
                    browser.downloads.onChanged.removeListener(fn);
                }
            }
            browser.downloads.onChanged.addListener(fn);
        }).catch(function (error) {
            $("#txtBackendPath").html("error: " + error);
        });
    }
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        var $div = $("#div-log .console");
        if(request.type == 'LOGGING'){
            var b = Math.abs($div.scrollTop() - ($div[0].scrollHeight - $div.height())) < 100;
            var item = request.log;
            $("<div/>").appendTo($div).html(`[${item.logtype}] ${item.content}`);
            if(b)
                $div.scrollTop($div[0].scrollHeight - $div.height());
        }else if(request.type == "BACKEND_SERVICE_STARTED"){
            if(request.version=='1.7.0')
                initMover();
        }
    });
    browser.runtime.sendMessage({type: 'GET_ALL_LOG_REQUEST'}).then((response) => {
        var $div = $("#div-log .console");
        response.logs.forEach(function(item){
            $("<div/>").appendTo($div).html(`[${item.logtype}] ${item.content}`);
        })
    });
}
