import {BookTree} from "./tree.js";
import {settings, global} from "./settings.js"
import {scriptsAllowed, showNotification, getColorFilter, genItemId, gtv, sendTabContentMessage} from "./utils.js"
import {log} from "./message.js"
import {SimpleDropdown} from "./control.js"
// import {getMainMimeExt} from "./libs/mime.types.js"

var currTree;
var thisWindowId;

/* show members of an object */
function dir(o, delimiter){
    var a = [];
    for(i in o){
        a.push(i)
    }
    return a.join(delimiter || "\n");
}
function withCurrTab(fn){
    browser.tabs.query({currentWindow: true, active: true}).then(function(tabs){
        fn.apply(null, [tabs[0]]);
    });
}
function initRdf(rdf, callback){
    var content = `<?xml version="1.0"?>
<RDF:RDF xmlns:NS1="scrapbee@163.com" xmlns:NC="http://home.netscape.com/NC-rdf#" xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<RDF:Seq RDF:about="urn:scrapbook:root"></RDF:Seq>
</RDF:RDF>`;
    browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: content, path: rdf}).then((response) => {
        callback && callback();
    }).catch((err) => {
        alert("{Warning}", err.message)
    });
}
// function getCurrContainer(){
//     var $container;
//     var $f = $(".item.focus");
//     if($f.length){
//         if($f.hasClass("folder")){
//             $container = $f.next(".folder-content");
//         }else{
//             $container = $f.parent(".folder-content");
//         }
//     }else{
//         $container = $(".root.folder-content");
//     }
//     return $container;;
// }
// function getCurrRefId(){
//     var $f = $(".item.focus");
//     if($f.length){
//         if(!$f.hasClass("folder")){
//             return $f.attr("id");
//         }
//     }
// }
function showDlg(name, data, onshowed){
    if($(".dlg-cover:visible").length)
        return Promise.reject(Error("only one dialog can be showed"))
    var $dlg = $(".dlg-cover.dlg-" + name).clone().appendTo(document.body);
    $dlg.show();
    data = data||{}
    $dlg.html($dlg.html().replace(/\[([^\[\]]+?)\]/g, function(a, b){
        return data[b] || ""
    }));
    $dlg.find("input,textarea").each(function(){
        if(this.name){
            if(this.type=="radio"){
                if(this.value == data[this.name])
                    this.checked = true;
            } else {
                if(typeof data[this.name] != "undefined")
                    this.value = data[this.name];
            }
        }
    });
    /** focus input */
    $dlg.find("input").eq(0).focus();
    /** put cursor and scroll to the end of a focused text input */
    if($dlg.find("input").eq(0).attr('type').toLowerCase() == "text"){
        var input = $dlg.find("input").eq(0)[0];
        input.setSelectionRange(input.value.length, input.value.length)
    }
    $(document).unbind("keyup.dialog");
    /** return promise object */
    var p = new Promise(function(resolve, reject){
        $(document).bind("keyup.dialog", function(e) {
            if (e.key === "Escape") { // escape key maps to keycode `27`
                $dlg.find("input.button-cancel").click();
            }else if(e.key === "Enter" && e.target.tagName != "TEXTAREA"){
                $dlg.find("input[type=submit]").click();
            }
        });
        $dlg.find("form").submit(function(){
            var data = {};
            $dlg.find("input,textarea").each(function(){
                if(this.name){
                    if(this.type=="radio"){
                        if(this.checked)
                            data[this.name] = $(this).val();
                    }else{
                        data[this.name] = $(this).val();
                    }
                }
            })
            $dlg.remove();
            resolve(data);
        });
        $dlg.find("input.button-cancel").bind("click.dlg", function(){
            $dlg.remove();
        });
    });
    onshowed && onshowed($dlg);
    return p;
}
function alert(title, message){
    return showDlg("alert", {dlg_title:title.translate(), message:message.translate()});
}
function confirm(title, message){
    return showDlg("confirm", {dlg_title:title.translate(), message:message.translate()});
}
/* context menu listener */
var menulistener={};
menulistener.onOpenAll = function(){
    var $foc = currTree.getFocusedItem();
    var liXmlNode = currTree.getItemXmlNode($foc.attr('id'));
    currTree.iterateLiNodes(function(item){
        if(item.nodeType == "bookmark" || item.nodeType == "page"){
            var url = item.nodeType == "page" ? currTree.getItemIndexPage(item.id) : item.source;
            currTree.onOpenContent(item.id, url, true, item.nodeType == "page");
        }
    }, [liXmlNode]);
}
menulistener.onSort1 = function(){
    confirm("{Sort}", "{ConfirmSorting}").then(async function(){
        await currTree.sortTree(true);
        currTree.onXmlChanged();
        await currTree.renderTree($(".root.folder-content"));
    });
}
menulistener.onSort2 = function(){
    confirm("{Sort}", "{ConfirmSorting}").then(async function(){
        await currTree.sortTree(false);
        currTree.onXmlChanged();
        await currTree.renderTree($(".root.folder-content"));
    });
}
menulistener.onDelete = function(){
    confirm("{Warning}", "{ConfirmDeleteItem}").then(function(){
        currTree.removeItem($(".item.focus"));
    });
}
menulistener.onCreateFolder = function(){
    showDlg("folder", {}).then(function(d){
        var p;
        if(d.pos == "root"){
            p = $(".root.folder-content");
        }else{
            p = currTree.getCurrContainer(); 
        }
        currTree.createFolder(p, genItemId(), currTree.getCurrRefId(), d.title, true);
    });
}
menulistener.onCreateSeparator = function(){
    currTree.createSeparator(currTree.getCurrContainer(), genItemId(), currTree.getCurrRefId(), true);
}
menulistener.onOpenOriginLink = function(){
    var $foc = currTree.getFocusedItem();
    var url = $foc.attr("source");
    var method = settings.open_in_current_tab == "on" ? "update" : "create";
    browser.tabs[method]({ url: url }, function(tab){});
}
menulistener.onDebug = function(){}
menulistener.onProperty = function(){
    var $foc = $(".item.focus");
    if($foc.length){
        var $label = $(".item.focus label");
        var id = $foc.attr("id");
        var c0 = currTree.getItemComment(id);
        var t0 = $foc.attr("title");
        var s0 = $foc.attr("source");
        var tag0 = currTree.getItemTag(id);
        var time = "";
        var type = currTree.getItemType($foc);
        var m = id.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
        var icon0 = currTree.getItemIcon(id);
        if(m){
            var lang = "en";
            var ui = browser.i18n.getUILanguage();
            if(["en", "zh-CN", "fr"].indexOf(ui) > -1){
                lang = ui;
            }
            var options = { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric'};
            time = new Date(m[1], m[2]-1, m[3], m[4], m[5]).toLocaleDateString(lang, options);
        }
        var t = type.replace(/^\w/, function(a){return a.toUpperCase()})
        t = `{${t}}`.translate();
        var opt = {dlg_title:"{Property}".translate(), title: (t0||"").htmlDecode(),
                   url: s0, id, time, type:t,
                   display_url: type == "folder" ? "none" : "",
                   display_icon: type == "folder" ? "none" : "",
                   comment: c0, tag: tag0, icon: icon0};

        showDlg("property", opt, function($dlg){
            // $dlg.find("input[name=icon_file_selector]").change(function(e){
            //     var fileName = e.target.files[0].;
            //     console.log(fileName)
            //     var icon = fileName.replace(new RegExp("^" + currTree.rdfPath + "data/" + id), "resource://scrapbook/data/" + id);
            //     $("input[name=icon").val(icon);
            // });
            // $dlg.find("input[name=icon_file_selector_button]").click(function(){
            //     $dlg.find("input[name=icon_file_selector]").trigger("click");
            // });
            $dlg.find("span[name=btnDefaultIcon]").click(function(){
                $("input[name=icon").val(`resource://scrapbook/data/${id}/favicon.ico`);
                return false;
            });
            $dlg.find("span[name=btnClearIcon]").click(function(){
                $("input[name=icon").val('');
                return false;
            });
        }).then(function(d){
            currTree.lockRdfSaving = true;
            var t1 = d.title.htmlEncode();
            if(t1 != t0){
                currTree.renameItem($foc, t1);
            }
            var s1 = d.url;
            if(s1 != s0 && opt.display_url == ""){
                currTree.updateSource($foc, s1);
            }
            var c1 = d.comment.htmlEncode();
            if(c1 != c0){
                currTree.updateComment($foc, c1);
            }
            var icon1 = d.icon.replace(new RegExp("^" + currTree.rdfPath + "data/"), "resource://scrapbook/data/");
            if(icon1 != icon0 && opt.display_icon == ""){
                currTree.updateItemIcon($foc, icon1);
            }
            // var tag1 = d.tag.htmlEncode();
            // if(tag1 != tag0){
            //     currTree.updateTag($foc, tag1);
            // }
            currTree.lockRdfSaving = false;
            if(t1 != t0 || s1 != s0 || c1 != c0 || icon1 != icon0){ //  || tag1 != tag0
                currTree.onXmlChanged();
            }
        });
    }
}
menulistener.onOpenFolder = function(){
    if($(".item.focus").length){
        var id = $(".item.focus").attr("id");
        var path = currTree.getItemFilePath(id);
        $.post(settings.backend_url + "filemanager/", {path:path}, function(r){});
    }
}
var drop;
function showRdfList(){
    log.info("show rdf list")
    var lastRdf = settings.last_rdf;
    var saw = false;
    var paths = settings.getRdfPaths();
    drop = drop || new SimpleDropdown($(".drop-button")[0], [])
    drop.clear()
    drop.onchange=(function(title, value){
        $(".drop-button .label").html(title || "")
        if(value !== null)switchRdf(value);  // switch rdf and notify other side bar.
    });
    if(paths){
        var names = settings.getRdfPathNames(); 
        names.forEach(function(n, i){
            if(!saw && typeof lastRdf != "undefined" && paths[i] == lastRdf){
                saw = true;
                drop.select(n, paths[i])
            }
            drop.addItem(n, paths[i]);
        });
        if(!saw){
            drop.select(names[0], paths[0])
        }
    }
}
function applyAppearance(){
    var id = "scrapbee_setting_style";
    $("#"+id).remove();
    var sheet = document.createElement('style');
    sheet.id=id;
    var item_h = parseInt(settings.font_size);
    var line_spacing = parseInt(settings.line_spacing);
    var icon_h = parseInt(settings.font_size) * 1.2;
    var icon_space = icon_h + 2
    var origin_h = parseInt(settings.font_size) * 0.80;
    var bg_color = settings.bg_color;
    // var filter = getColorFilter("#"+settings.font_color).filter;
    sheet.innerHTML = `
*{
  color:${settings.font_color}
}
.item.local,.item.folder{
  color:#${settings.font_color}
}
.item.bookmark label{
  color:#${settings.bookmark_color}
}
.toolbar{
  backgroud-color:#${bg_color}
}
body{
  background:#${bg_color}
}
.dlg-cover{
  background:#${bg_color}99;
}
.toolbar{
  border-color:#${settings.font_color};
  background:#${bg_color}
}
.item.separator{
  border-color:#${bg_color};
  background:#${settings.separator_color}
}
.item.page,.item.bookmark,.item.folder{
  000padding-left:${icon_space}px;
  background-size:${icon_h}px ${icon_h}px;
}
.item.page label,.item.bookmark  label,.item.folder label{
  font-size:${settings.font_size}px;
}
.item.page i,.item.bookmark i,.item.folder i{
  width:${icon_h}px;
  height:${icon_h}px;
}
.item.page input[type='checkbox'],
.item.bookmark input[type='checkbox'],
.item.folder input[type='checkbox']{
  mask-size:${icon_h}px ${icon_h}px;
  width:${icon_h}px;
  height:${icon_h}px;
}
.item input[type='checkbox']{
  background-color:#${settings.font_color};
}
.folder-content{
  margin-left:${item_h}px;
}
.item .origin{
  width:${origin_h}px;
  height:${origin_h}px;
  mask-size:${origin_h}px ${origin_h}px;
  background:#${settings.font_color}
}
.item{
  margin-top:0 !important;
  margin-bottom:${line_spacing}px !important
}
.simple-menu-button{
  border-color:#${settings.font_color}
}
.simple-menu{
  background:#${bg_color};
  border-color:#${settings.font_color}
}
.drop-button{
  border-color:#${settings.font_color}
}
.drop-button .label{
  color:#${settings.font_color}
}
.drop-button .button{
  border-color:#${settings.font_color};
  color:#${settings.font_color}
}
.item.bookmark.focus label,
.item.page.focus label,
.item.folder.focus label,
.simple-menu div:hover,
.tool-button:hover{
  background-color:#${settings.focused_bg_color};
  color:#${settings.focused_fg_color};
}
.tool-button:hover:before{
  background-color:#${settings.focused_fg_color};
}
.tool-button:before{
  background-color:#${settings.font_color};
}`
    document.body.appendChild(sheet);
}
settings.onchange=function(key, value){
    if(key == "rdf_path_names" || key == "rdf_paths"){
        showRdfList();
    }else if(key == "font_size" || key == "line_spacing" || key.match(/\w+_color/)){
        applyAppearance();
    }else if(key == "backend_port"){
        browser.runtime.sendMessage({type: 'START_WEB_SERVER_REQUEST', port: settings.backend_port, force: true}).then((response) => {
            loadAll();
        });
    }
};
/* on page loaded */
function loadAll(){    
    /** rdf list */
    showRdfList(); /** this will trigger loading a rdf initially */
    /** open file manager */
    $("#btnFileManager").click(function(){
        var rdfPath=currTree.rdfPath;
        $.post(settings.backend_url + "filemanager/", {path:rdfPath}, function(r){
            // 
        });
    });
}
function initTabs($tabbars){
    $tabbars.each(function(){
        var $pages = $(this).nextAll(".tab-page");
        var $tabs = $(this).find("span"); 
        $tabs.click(function(){
            $pages.hide();
            $tabs.removeClass("on");
            $(this).addClass("on");
            $pages.eq($(this).index()).show();
        });
        $tabs.eq(0).click();
    });
}
window.onload=async function(){
    await settings.loadFromStorage();
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();
    /** init tab frames */
    const targetNode = document.body;
    const config = { attributes: false, childList: true, subtree: true };
    const callback = function(mutationsList, observer) {
        for(let mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    initTabs($(node).find(".tab-page-top-bar"));
                });
            }
        }
    };
    const observer = new MutationObserver(callback);
    observer.observe(targetNode, config);
    /** */
    var btn = document.getElementById("btnLoad");
    btn.onclick = function(){
        if(currTree && currTree.rdf)loadXml(currTree.rdf);
    }
    var btn = document.getElementById("btnSet");
    btn.onclick = function(){
        // window.open("options.html", "_scrapbee_option")
        browser.tabs.create({
            "url": "options.html"
        });
        // runtime.openOptionsPage()
    }
    var btn = document.getElementById("btnHelp");
    btn.onclick = function(){
        // window.open("options.html#help", "_scrapbee_option")
        browser.tabs.create({
            "url": "options.html#help"
        });
    }
    var btn = document.getElementById("btnSearch");
    btn.onclick = function(){
        // window.open("search.html", "_scrapbee_search")
        browser.tabs.create({
            "url": "search.html?rdf=" + currTree.rdf
        });
    }
    $("menuitem").click(function(e){
        if(currTree){
            var listener = menulistener[this.id.replace(/^menu/, "on")];
            listener && listener();
        }
    });
    /**  */
    applyAppearance();
    browser.runtime.sendMessage({type: 'START_WEB_SERVER_REQUEST', port: settings.backend_port}).then((response) => {
        loadAll();
    });
    /** announcement */
    var ann = browser.i18n.getMessage("announcement_content")
    var m = ann.match(/#(\d+\.\d+\.\d+)#/)
    if(m){
        if(gtv(m[1], settings.announcement_showed)){
            $("#announcement-red-dot").show()
        }else{
            $("#announcement-red-dot").hide()
        }
        $("#announcement-red-dot").parent().click(function(){
            settings.set('announcement_showed', m[1], true)
            $("#announcement-red-dot").hide()
        });
    }
}
function loadXml(rdf){
    currTree=null;
    if(!rdf)return;
    $(".root.folder-content").html("{Loading...}".translate());
    var rdfPath = rdf.replace(/[^\/\\]*$/, "");
    var rdf_file = rdf.replace(/.*[\/\\]/, "");
    var xmlhttp=new XMLHttpRequest();
    xmlhttp.onload = async function(r) {
        try{
            var _begin = new Date().getTime();
            currTree = new BookTree(r.target.response, rdf)
            await currTree.renderTree($(".root.folder-content"));
            var cost = new Date().getTime() - _begin;
            log.info(`rdf loaded in ${cost}ms`)
        }catch(e){
            log.error(e.message)
        }
        currTree.onXmlChanged=function(){
            if(currTree.lockRdfSaving)
                return;
            log.info(`saving changes to rdf`);
            browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: currTree.xmlSerialized(), path: currTree.rdf, boardcast: true, srcToken: currTree.unique_id}).then((response) => {
                log.info(`save changes to rdf, done`);
            });
        }
        currTree.onItemRemoved=function(id){
            $.post(settings.backend_url + "deletedir/", {path: rdfPath + "data/" + id}, function(r){});
        }
        currTree.onOpenContent=function(itemId, url, newTab, isLocal){
            var method = newTab ? "create" : "update";
            if(/^file\:/.test(url)){
                url = settings.backend_url + "file-service/" + url.replace(/.{7}/,'');
            }
            browser.tabs[method]({ url: url }, function (tab) {});
        }
        currTree.onChooseItem=function(id){
            var $f = currTree.getItemById(id)
            if ($f.hasClass("folder")) {
                $(document.body).attr("contextmenu", "popup-menu-folder");
            } else if ($f.hasClass("separator")) {
                $(document.body).attr("contextmenu", "popup-menu-separator");
            } else if ($f.hasClass("item")) {
                $(document.body).attr("contextmenu", "popup-menu-link");
                if($f.hasClass("bookmark")){
                    $("#menuOpenOriginLink")[0].disabled=true;
                }else{
                    $("#menuOpenOriginLink")[0].disabled=false;
                }
            } else {
                $(document.body).attr("contextmenu", "popup-menu-body");
            }
        }
    };
    xmlhttp.onerror = function(err) {
        log.info(`load ${rdf} failed, ${err}`)
    };
    xmlhttp.open("GET", settings.backend_url + "file-service/" + rdf, false);
    xmlhttp.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
    xmlhttp.setRequestHeader('cache-control', 'max-age=0');
    xmlhttp.setRequestHeader('expires', '0');
    xmlhttp.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
    xmlhttp.setRequestHeader('pragma', 'no-cache');
    xmlhttp.send();
}
function switchRdf(rdf){
    currTree = null;
    log.info(`switch to rdf "${rdf}"`)
    settings.set('last_rdf', rdf, true);
    if(!$.trim(rdf)){
        $(".root.folder-content").html("Invaid rdf path.")
        return;
    }
    $(".root.folder-content").html("{Loading...}".translate());
    /** check rdf exists */
    $.post(settings.backend_url + "isfile/", {path: rdf}, function(r){
        if(r == "yes"){
            loadXml(rdf);
        }else if(rdf){
            /** show it need to create rdf */
            $(".root.folder-content").html(`Rdf {File} ${rdf} {NOT_EXISTS}, {CREATE_OR_NOT}? `.translate())
            $("<a href='' class='blue-button'>{Yes}</a>".translate()).appendTo($(".root.folder-content")).click(function(){
                initRdf(rdf, function(){
                    loadXml(rdf);
                });
                return false;
            });
        }
    });
}
function requestUrlSaving(itemId){
    withCurrTab(function(tab){
       var icon = tab.favIconUrl;
       var ref_id;
       function Next(){
           var $container = null;
           var $f = $(".item.focus");
           if($f.length){
               if($f.hasClass("folder")){
                   $container = $f.next(".folder-content");
               }else{
                   ref_id=$f.attr("id");
                   $container = $f.parent(".folder-content");
               }
           }else{
               $container = $(".root.folder-content");
           }
           currTree.createLink(currTree.getCurrContainer(), "bookmark", itemId, currTree.getCurrRefId(), tab.url, icon, tab.title, false, true);
           showNotification({message: `Capture url "${tab.title}" done`, title: "Info"});
       }
       if(icon && icon.match(/^data:image/i)){
           var rdf_path = settings.getLastRdfPath();
           var filename = `${rdf_path}/data/${itemId}/favicon.ico`;
           $.post(settings.backend_url + "download", {url: icon, itemId: itemId, filename: filename}, function(r){
               icon = "resource://scrapbook/data/" + itemId + "/favicon.ico";
               Next();
           })
       }else{
           Next();
       }
    });
}
/* receive message from background page */
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if(request.type == 'UPDATE_CONTEXTMENU_REQUEST'){
    }else if(request.type == 'GET_OTHER_INSTANCE_REQUEST'){
        browser.runtime.sendMessage({session_id:request.session_id});
    }else if(request.type == 'FILE_CONTENT_CHANGED'){
        if(currTree){
            if(request.filename == currTree.rdf && request.srcToken != currTree.unique_id){
                loadXml(currTree.rdf);
            }
        }
    }else if(request.type == 'SAVE_URL_REQUEST'){
       if(currTree && currTree.rendered) {
           browser.windows.getLastFocused().then(function(win){
               if(win.id == thisWindowId)
                   requestUrlSaving(genItemId());
           });
       }else{
           log.error("rdf have not been loaded")
       }
    }else if(request.type == 'CREATE_MIRROR_NODE'){
        /** do not trigger rdf saving */
        if(currTree && currTree.rendered && request.rdf == currTree.rdf){
            currTree.lockRdfSaving = true;
            currTree.createLink(currTree.getContainerById(request.folderId), request.nodeType, request.itemId,
                                request.refId, request.url, request.ico, request.title,
                                true,   // waiting
                                true,   // is new node (create xml node)
                                request.comment);  
            currTree.lockRdfSaving = false;
        }
    }else if(request.type == 'UPDATE_FINISHED_NODE'){
        /** update node in sidebar only in the same window, sidebar in other windows will reloaded after icon updated */
        if(currTree && currTree.rendered && request.rdf == currTree.rdf){
            var icon = request.have_icon ? "resource://scrapbook/data/" + request.itemId + "/favicon.ico" : "";
            if(sender.tab.windowId != thisWindowId)
                currTree.lockRdfSaving = true;
            currTree.updateItemIcon($("#"+request.itemId), icon);
            currTree.unlockItem($("#"+request.itemId));
            currTree.lockRdfSaving = false;
        }
    }else if(request.type == 'CREATE_NODE_REQUEST'){
        return new Promise((resolve, reject) => {
            if(currTree && currTree.rendered && sender.tab.windowId == thisWindowId) {
                var itemId = genItemId();
                var icon = request.have_icon ? "resource://scrapbook/data/" + request.itemId + "/favicon.ico" : "";
                currTree.lockRdfSaving = true;
                currTree.createLink(currTree.getCurrContainer(), request.nodeType, itemId, currTree.getCurrRefId(), request.url, icon, request.title, true, true);
                currTree.lockRdfSaving = false;
                resolve({rdf:currTree.rdf, rdfPath:currTree.rdfPath, itemId});
            }else{
                reject(Error("rdf have not been loaded"));
            }
        });
    }else if(request.type == 'LOCATE_ITEM'){
        return new Promise((resolve, reject) => {
            if($(".dlg-cover:visible").length){
                return reject();
            }
            if(currTree && currTree.rendered && sender.tab.windowId == thisWindowId) {
                var $item = currTree.getItemById(request.id);
                if($item.length){
                    currTree.focusItem($item);
                    currTree.expandAllParents($item);
                    currTree.scrollToItem($item, 500, $(".toolbar").height() + 5);
                    resolve();
                }else{
                    reject();
                }
            }
        });
    }
});
document.addEventListener('contextmenu', function(event){
    if($(".dlg-cover:visible").length)
        event.preventDefault()
    return false;
});
browser.windows.getCurrent({populate: true}).then((windowInfo) => {
    thisWindowId = windowInfo.id;
});
console.log("==> main.js loaded");
