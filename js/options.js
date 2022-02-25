import {global} from "./global.js";
import {log} from "./message.js";
import {initMover, initExporter} from "./tools.js";
import {gtev, touchRdf, dataURLtoBlob} from "./utils.js";
import {ContextMenu} from "./control.js";
import {Configuration, History} from "./storage.js";

window.GLOBAL = global;
window.CONF = new Configuration();
window.HISTORY = new History();

function getAsync(url) {
    return new Promise((resolve, reject) => {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function() {
            if (this.readyState == 4) {
                if (this.status == 200) {
                    resolve(this.response);
                } else if (this.status >= 404) {
                    reject(Error(this.response));
                }
            }
        };
        request.onerror = function(err) {
            reject(Error("request failed"));
        };
        request.open("GET", url);
        request.send();
    });
}

function createRdfField(k, v){
    var NAME_I18N = browser.i18n.getMessage("Name");
    var FILE_I18N = browser.i18n.getMessage("File");
    var $el = $(`<div class='rdf-row'><span>${NAME_I18N}</span> <input type="text" name="name"/>
${FILE_I18N} <input type="text" name="value"/>
<input type="button" name="move" value="" class="moveup"/>
<input type="button" name="move" value="" class="movedn"/>
<input type="button" name="del" value="" class="delete"/></div>`).appendTo($("#rdf-area"));
    $el.find("input[name=name]").val(k);
    $el.find("input[name=value]").val(v);
    $el.find("input[name=del]").click(function(){
        $(this).parent().remove();
    });
    $el.find("input[name=move]").click(function(){
        var up = (this.className == 'moveup');
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

function showConfiguration(){    
    $("#rdf-area").empty();
    $("input[name='save']").click(function(){
        var dialog = new DialogWaiting();
        dialog.show();

        setTimeout(r => {
            try{
                // backend
                var pwd = $.trim($("input[name=backend_pwd]").val());
                if(pwd){
                    if(!pwd.match(/^[0-9a-zA-Z]+$/)){
                        throw Error("invalid password format");
                    }
                }
                CONF.setItem('backend.type', $("input[name=backend_type]:checked").val());
                CONF.setItem('backend.address', $("input[name=backend_address]").val());
                CONF.setItem('backend.port', $("input[name=backend_port]").val());
                CONF.setItem('backend.pwd', $("input[name=backend_pwd]").val());
                
                // rdf list
                var names = [];
                var paths = [];
                var touch = [];
                $("#rdf-area div input:nth-of-type(1)").each(function(){
                    var n = $.trim(this.value);
                    //names.push(n + "\n");
                    names.push(n);
                    var p = $.trim($(this).next("input").val());
                    //paths.push(p + "\n");
                    paths.push(p);
                    touch.push(touchRdf(CONF.getBackendAddress(), p, pwd));
                });
                Promise.all(touch);
                CONF.setItem('tree.paths', paths);
                CONF.setItem('tree.names', names);

                // apparence
                var size = (parseInt($("input[name=font_size]").val() / 5) * 5) / 100 * 12;

                CONF.setItem('tree.color.bg', $("input[name='tree.color.bg']").val().replace("#", ""));
                CONF.setItem('tree.color.fg', $("input[name='tree.color.fg']").val().replace("#", ""));
                CONF.setItem('tree.color.separator', $("input[name='tree.color.separator']").val().replace("#", ""));
                CONF.setItem('tree.color.bookmark', $("input[name='tree.color.bookmark']").val().replace("#", ""));
                CONF.setItem('tree.color.focused.fg', $("input[name='tree.color.focused.fg']").val().replace("#", ""));
                CONF.setItem('tree.color.focused.bg', $("input[name='tree.color.focused.bg']").val().replace("#", ""));
                CONF.setItem('tree.font.size', size);
                CONF.setItem('tree.font.name', $("input[name=font_name]").val());
                CONF.setItem('tree.line.spacing', $("input[name=line_spacing]").val());
                
                // behavior
                CONF.setItem('sidebar.behavior.open.dest', $("input[name=open_in_current_tab]").is(":checked")?"curr-tab":"new-tab");
                CONF.setItem('sidebar.behavior.root.show', $("input[name=sidebar_show_root]").is(":checked")?"on":"off");
                CONF.setItem('capture.behavior.saving.dialog.close', $("input[name=auto_close_saving_dialog]").is(":checked")?"auto":"manually");
                CONF.setItem('capture.behavior.frames.save', $("input[name=saving_save_frames]").is(":checked")?"on":"off");
                CONF.setItem('capture.behavior.item.new.pos', $("input[name=saving_new_pos]:checked").val());
                CONF.setItem("global.notification.show", $("input[name=show_notification]").is(":checked")?"on":"off");
                CONF.setItem("global.debug", $("input[name=debug]").is(":checked")?"on":"off");
                CONF.commit();

                dialog.remove();
            }catch(e){
                alert("Save failed: " + e);
            }
        }, 500);
    });
    var paths = CONF.getRdfPaths();
    if(paths){
        CONF.getRdfNames().forEach(function(k, i){
            createRdfField(k, paths[i]);
        });
    }
    $("input[name=font_size]").bind("input", function(){ // bind 'input' instead of 'change' event
        $(this).next("span").text((parseInt(this.value / 5) * 5) +"%");
    });
    $("input[name=line_spacing]").bind("input", function(){ // bind 'input' instead of 'change' event
        $(this).next("span").text(parseInt(this.value));
    });
    ["bg", "fg", "separator", "bookmark", "focused.fg", "focused.bg"].forEach(function(item){
        var name = "tree.color." + item;
        var key = "tree.color." + item;
        var value = (CONF.getItem(key) || "").replace("#", "");
        var element = $(`input[name='${name}']`)[0];
        element.value = value;
        if(element.jscolor){
            element.jscolor.fromString(value); /** for updating */
        }
    });

    jscolor.installByClassName("jscolor");
    $("input[name=font_size]").val((CONF.getItem("tree.font.size") / 12) * 100).trigger("input");
    $("input[name=font_name]").val(CONF.getItem("tree.font.name"));    
    $("input[name=line_spacing]").val(CONF.getItem("tree.line.spacing")).trigger("input");

    var type = CONF.getItem("backend.type");
    $(`input[name=backend_type][value='${type}']`).attr("checked", true);
    $("input[name=backend_address]").val(CONF.getItem("backend.address"));
    $("input[name=backend_port]").val(CONF.getItem("backend.port"));
    $("input[name=backend_pwd]").val(CONF.getItem("backend.pwd"));
    $("input[name=sidebar_show_root]").prop("checked", CONF.getItem("sidebar.behavior.root.show")=="on");
    $("input[name=open_in_current_tab]").prop("checked", CONF.getItem("sidebar.behavior.open.dest")=="curr-tab");
    $("input[name=auto_close_saving_dialog]").prop("checked", CONF.getItem("capture.behavior.saving.dialog.close")=="auto");
    $("input[name=show_notification]").prop("checked", CONF.getItem("global.notification.show") == "on");
    $("input[name=saving_save_frames]").prop("checked", CONF.getItem("capture.behavior.frames.save")=="on");
    
    var pos = CONF.getItem("capture.behavior.item.new.pos");
    $(`input[name=saving_new_pos][value='${pos}']`).attr("checked", true);
    $("input[name=debug]").prop("checked", CONF.getItem("global.debug")=="on");
}

$(document).ready(async function(){
    await GLOBAL.load();
    await CONF.load();
    await HISTORY.load();

    var paths = CONF.getRdfPaths();

    var lang = "en";
    var ui = browser.i18n.getUILanguage();
    if(["en", "zh-CN", "fr"].indexOf(ui) > -1) {
        lang = ui;
    }
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();

    getAsync("/_locales/" + lang + "/announcement.html").then((content) => {
        $("#div-announcement").html(content.translate());
        // $("#div-announcement").html($("#div-announcement").html().replace(/#(\d+\.\d+\.\d+)#/ig, "<h2>V$1</h2>"))
    }).catch(e => {
        alert(e.message);
    });

    getAsync("/_locales/" + lang + "/help.html").then((content) => {
        $("#div-help>div").html(content.translate());
        $(".download_exe").each(function(i, el){
            this.onclick=function(){
                var [src, dest] = getBackendDownload(i);
                browser.downloads.download({
                    url:src,
                    filename: dest,
                    // conflictAction: "overwrite",
                    saveAs: true
                });
                return false;
            };
        });        
    });

    $(".tab-button").each((i, el)=>{
        $(el).click((e)=>{
            $(".tab-button").removeClass("focused");
            $(e.target).addClass("focused");
            $(".tab-content").hide();
            $(".tab-content").eq(i).show();
        });
    });
    $(".tab-button").eq(0).click();

    /** export / import */
    $("input[name='export']").click(async function(){
        var json = CONF.getJson();
        downloadText(JSON.stringify(json, null, 2), "scrapbee_configure.json", null, true);
    });
    $("input[name='import']").click(async function(){
        document.getElementById("import_file").onchange=function(){
            var fileToLoad = document.getElementById("import_file").files[0];
            var fileReader = new FileReader();
            fileReader.onload = function(fileLoadedEvent){
                var textFromFileLoaded = fileLoadedEvent.target.result;
                try{
                    var json = JSON.parse(textFromFileLoaded);
                    CONF.loadJson(json);
                    showConfiguration();
                }catch(e){
                    alert("Invalid configuration file".translate());
                }
            };
            fileReader.readAsText(fileToLoad, "UTF-8");
        };
        document.getElementById("import_file").click();
    });
    /** tools */
    function initTools(version){
        if(gtev(version, '1.7.0')){
            initMover();
            initExporter();
            log.debug("tools initiated successfully.");
        }else{
            log.error("can not initiate tools, make sure backend 1.7.0 or later installed.");
        }
    }
    browser.runtime.sendMessage({type: 'GET_BACKEND_VERSION'}).then((version) => {
        initTools(version);
    });
    function findOffsetParent(el){
        var r = document.body;
        var p = el.parentNode;
        while(p){
            var style =  window.getComputedStyle(p, null).getPropertyValue('position');
            if(style == "absolute" || style == "relative"){
                r = p;
                break;
            }
            p = p.parentNode;
        }
        return r;
    }
    
    /** help mark */
    $(".help-mark, .warn-mark").hover(function(e){
        var parent = findOffsetParent(e.target);
        var offset = parent.getBoundingClientRect();
        $(this).next(".tips.hide").show().css({
            left: e.clientX - offset.left + "px",
            top:  e.clientY - offset.top + "px",
        });
    }, function(){
        $(this).next(".tips.hide").hide();
    });
    
    /** more donation */
    if($.trim($("#divMoreDonateWay>div").text())){
        $("#divMoreDonateWay").show();
    }
    $("input[name='add']").click(function(){
        createRdfField("", "");
    });
    
    showConfiguration();

    /** backend */
    $(`input[name=backend_type]`).click(function(){
        if(this.value == "address"){
            $(this).closest("tr").next("tr").hide();
            $(this).closest("tr").next("tr").next("tr").show();
        }else{
            $(this).closest("tr").next("tr").show();
            $(this).closest("tr").next("tr").next("tr").hide();
        }
    });
    $(`input[name=backend_type]:checked`).click();
    var dp = HISTORY.getItem("backend.download.path");
    if(dp){
        $("#txtBackendPath").show();
        $("#txtBackendPath").html("{ALREADY_DOWNLOADED_TO}: ".translate() + dp);
    }
    
    function applyArea(){
        $(".div-area").hide();
        $("a.left-index").removeClass("focus");
        var map = {};
        location.href.replace(/.+#/, "").replace(/(\w+)=(\w+)/g, function(a, b, c){
            map[b] = c;
        });
        map.area = map.area || "configure";
        $("#div-" + map.area).show();
        $("a.left-index[href='#area=" + map.area + "']").addClass("focus");
        if(map.scroll){
            $(document.body).animate({
                'scrollTop': $(`#${map.scroll}`).offset().top
            }, 1000);
        }
    }
    
    window.onhashchange=()=>applyArea();
    applyArea();
    $("#donate").click(() => window.open('http://PayPal.me/VFence', '_blank'));

    function getBackendDownload(sourceId){
        const extRoot = "moz-extension://" + global.extensionId;
        var sources = [
            // extRoot + "/bin/",
            // "https://raw.githubusercontent.com/vctfence/scrapbee_backend/v1.7.1/",
            "https://github.com/vctfence/scrapbee_backend/blob/master/",
            "https://raw.githubusercontent.com/vctfence/scrapbee_backend/master/",
            "https://gitee.com/vctfence/scrapbee_backend/raw/master/"];
        var binDir = sources[sourceId];
        var src_exec = "scrapbee_backend";

        if(GLOBAL.platformOS == "mac")
            src_exec += "_mac";
        else if(GLOBAL.platformOS == "linux")
            src_exec += "_lnx";
        
        if(GLOBAL.platformArch == "x86-64"){
            src_exec += "_64"; 
        }else if(GLOBAL.platformArch == 'aarch64'){
            src_exec += "_arm64";
        }

        src_exec += GLOBAL.platformOS == "win" ? ".exe" : "";
        src_exec += "?raw=true";

        var dest_exec = "scrapbee_backend" + (GLOBAL.platformOS == "win" ? ".exe" : "");
        return [binDir + src_exec, dest_exec];
    }
 
    /** download install scripts */
    $("#btnDownloadScripts").click(async function(){
        var self = this;
        const extRoot = "moz-extension://" + global.extensionId;

        try{
            /*** download an empty file to get the download path (can be choosed by user) */
            var dwInfo = await downloadText("", "scrapbee/scrapbee_backend.json");
            var downloadPath = dwInfo.filename.replace(/[^\\\/]*$/, "");

            /*** download install script */
            if(GLOBAL.platformOS == "win")
                dwInfo = await downloadText(installBat(downloadPath, GLOBAL.browserName), "scrapbee/install.bat");
            else if(GLOBAL.platformOS == "mac")
                dwInfo = await downloadFile(extRoot + "/install/install_mac.sh", "scrapbee/install.sh");
            else
                dwInfo = await downloadFile(extRoot + "/install/install_lnx.sh", "scrapbee/install.sh");

            /*** download backend config file */
            var [src_exec, dest_exec] = getBackendDownload(0);
            // downloadPath = filename.replace(/[^\\\/]*$/, "");
            
            var json = {"allowed_extensions": ["scrapbee@scrapbee.org"],
                        "description": "ScrapBee backend",
                        "name": "scrapbee_backend",
                        "path": downloadPath + dest_exec, /** path to backend executable */
                        "type": "stdio"};
            
            var jstr = JSON.stringify(json, null, 2);
            await downloadText(jstr, "scrapbee/scrapbee_backend.json");

            $(self).next(".download-path").show();
            $(self).next(".download-path").html("{ALREADY_DOWNLOADED_TO}: ".translate() + downloadPath);
        }catch(e){
            alert(e);
        }
    });

    /** download backend */
    $("#btnDownloadBackend").click(function(){
        var self = this;
        function Start(){
            // const extRoot = "moz-extension://" + global.extensionId;
            var sourceId = $("input[name='download_source']:checked").val();
            var [src_exec, dest_exec] = getBackendDownload(sourceId);
            /** download backend executable */
            downloadFile(src_exec, "scrapbee/" + dest_exec).then(function(dwInfo){
                /*** query really filename of backend executable */
                var downloadPath = dwInfo.filename.replace(/[^\\\/]*$/,"");
                if(downloadPath){
                    HISTORY.setItem("backend.download.path", downloadPath);
                    $(self).next(".download-path").show();
                    $(self).next(".download-path").text("{ALREADY_DOWNLOADED_TO}: ".translate() + downloadPath);
                }
            }).catch(e => {
                alert(e);
            });
        }
        $("#txtBackendPath").show();
        $("#txtBackendPath").text("Downloading...");  // todo: error output
        setTimeout(Start, 1000);
    });

    function installBat(backend_path, browserName){
        var soft = browserName == 'Waterfox' ? 'Waterfox' : 'Mozilla';
        return `chcp 65001\r\n\r
reg delete "HKEY_LOCAL_MACHINE\\SOFTWARE\\${soft}\\NativeMessagingHosts\\scrapbee_backend" /f\r
reg add "HKEY_LOCAL_MACHINE\\SOFTWARE\\${soft}\\NativeMessagingHosts\\scrapbee_backend" /d "${backend_path}\scrapbee_backend.json" /f\r\n\r
reg delete "HKEY_CURRENT_USER\\Software\\${soft}\\NativeMessagingHosts\\scrapbee_backend" /f\r
reg add "HKEY_CURRENT_USER\\Software\\${soft}\\NativeMessagingHosts\\scrapbee_backend" /d "${backend_path}\scrapbee_backend.json" /f\r\n\r
echo done\r
pause`;
    }
    
    function downloadFile(src, dest){
        return new Promise((resolve, reject) => {
            browser.downloads.download({
                url:src,
                filename: dest,
                conflictAction: "overwrite",
                saveAs: false
            }).then(function(id){
                browser.downloads.onChanged.addListener((downloadDelta) => {
                    if(downloadDelta.id == id && (downloadDelta.state && downloadDelta.state.current == "complete")){
                        // if(callback)callback(id);
                        browser.downloads.search({id: id}).then((downloads) => {
                            // var filename = downloads[0].filename;
                            resolve(downloads[0]);
                        });
                        browser.downloads.onChanged.removeListener(fn);
                    }
                });
            });
        });
    }
    
    function downloadText(text, filename, callback, saveAs=false){
        var blob = new Blob([text], {type : 'text/plain'});
        var objectURL = URL.createObjectURL(blob);
        return new Promise((resolve, reject) => {
            browser.downloads.download({
                url:objectURL,
                filename: filename,
                conflictAction: "overwrite",
                saveAs: saveAs
            }).then(function(id){
                browser.downloads.onChanged.addListener((downloadDelta) => {
                    if(downloadDelta.id == id && (downloadDelta.state && downloadDelta.state.current == "complete")){
                        browser.downloads.search({id: id}).then((downloads) => {
                            // var filename = downloads[0].filename;
                            resolve(downloads[0]);
                        });
                        URL.revokeObjectURL(objectURL);
                        browser.downloads.onChanged.removeListener(fn);
                    }
                });
            }).catch(function (error) {
                reject(e);
            });
        });
    }
    /* LOGGING */
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        var $div = $("#div-log .console");
        if(request.type == 'LOGGING'){
            var item = request.log;
            if(item.logtype != "debug" || CONF.getItem("global.debug") == "on"){
                var b = Math.abs($div.scrollTop() - ($div[0].scrollHeight - $div.height())) < 100;
                var $line = $("<div class='log-line'/>").appendTo($div).html(`[${item.logtype}] ${item.content}`);
                $line.addClass(item.logtype);
                if(b)
                    $div.scrollTop($div[0].scrollHeight - $div.height());
            }
        }else if(request.type == "BACKEND_SERVICE_STARTED"){
            initTools(request.version);
        }
    });
    
    browser.runtime.sendMessage({type: 'GET_ALL_LOG_REQUEST'}).then((response) => {
        var $div = $("#div-log .console");
        response.logs.forEach(function(item){
            if(item.logtype != "debug" || CONF.getItem("global.debug") == "on"){
                var $line = $("<div class='log-line'/>").appendTo($div).html(`[${item.logtype}] ${item.content}`);
                $line.addClass(item.logtype);
            }
        });
    });
});
