import {BookTree} from "./tree.js";
import {settings, global} from "./settings.js";
import {showNotification, getColorFilter, genItemId, gtv, ajaxFormPost} from "./utils.js";
import {refreshTree, touchRdf} from "./utils.js";
import {log} from "./message.js";
import {SimpleDropdown, ContextMenu} from "./control.js";
import {History} from "./history.js"

var currTree;
var thisWindowId;

/* show members of an object */
function dir(o, delimiter){
    var a = [];
    var i;
    for(i in o){
        a.push(i);
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
        if(callback)callback();
    }).catch((err) => {
        alert("{Warning}", err.message);
    });
}
function showDlg(name, data, onshowed){
    if($(".dlg-cover:visible").length)
        return Promise.reject(Error("only one dialog can be showed"));
    var $dlg = $(".dlg-cover.dlg-" + name).clone().appendTo(document.body);
    $dlg.show();
    data = data || {};
    $dlg.html($dlg.html().replace(/\[([^\[\]]+?)\]/g, function(a, b){
        return data[b] || "";
    }));
    $dlg.find("input,textarea").each(function(){
        if(this.name){
            if(this.type=="radio"){
                if(this.value == data[this.name])
                    this.checked = true;
            } else {
                if(typeof data[this.name] != "undefined"){
                    this.value = data[this.name];
                }
            }
        }
    });
    /** focus input */
    $dlg.find("input").eq(0).focus();
    /** put cursor and scroll to the end of a focused text input */
    if($dlg.find("input").eq(0).attr('type').toLowerCase() == "text"){
        var input = $dlg.find("input").eq(0)[0];
        input.setSelectionRange(input.value.length, input.value.length);
    }
    $(document).unbind("keyup.dialog");
    /** return promise object */
    var menu = document.body.ctxMenu;
    document.body.ctxMenu = null;
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
            $dlg.find("input,textarea,select").each(function(){
                if(this.name){
                    if(this.type=="radio"){
                        if(this.checked)
                            data[this.name] = $(this).val();
                    }else if(this.type=="checkbox"){
                        if(this.checked)
                            data[this.name] = $(this).val();
                    }else if(this.type=="select"){
                        data[this.name] = $(this).val();
                    }else{
                        data[this.name] = $(this).val();
                    }
                }
            });
            $dlg.remove();
            document.body.ctxMenu = menu;
            resolve(data);
        });
        $dlg.find("input.button-cancel").bind("click.dlg", function(){
            $dlg.remove();
            document.body.ctxMenu = menu;
            reject(Error(""));
        });
    });
    if(onshowed)onshowed($dlg);
    return p;
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
        if(item.nodeType == "bookmark" || item.nodeType == "page" || item.nodeType == "note"){
            currTree.onOpenContent(item.id, item.source, true, item.nodeType == "page" || item.nodeType == "note");
        }
    }, [liXmlNode]);
};

menulistener.onSort1 = function(){
    showDlg("sort", {}).then(async function(d){
        var $target = null;
        if(d.target == "selection"){
            var $tar = currTree.getFocusedItem();
            if($tar.length) $target = $tar;
        }
        await currTree.sortTree(d.sort_by, $target, d.order == "asc", d.case_sensitive=="on");
        currTree.onXmlChanged();
        await currTree.renderTree($(".folder-content.toplevel"), settings.sidebar_show_root == "on");
        currTree.restoreStatus();
    }).catch(()=>{});
};
menulistener.onDelete = function(){
    confirm("{Warning}", "{ConfirmDeleteItem}").then(function(){
        currTree.removeItem($(".item.focus")).finally(()=>{
            currTree.onXmlChanged();
        });
    }).catch(()=>{});
};
menulistener.onCreateFolder = function(){
    showDlg("folder", {}).then(function(d){
        var $foc = currTree.getFocusedItem();
        var p = currTree.getCurrContainer();
        var rid = null;
        if($foc.length){
            if($foc.hasClass("folder")){
                if(d.pos == "same_level"){
                    p = currTree.getParentContainer($foc);
                    rid = $foc.attr("id");
                }
            }else{
                rid = $foc.attr("id");
            }
        }
        log.debug(settings.saving_new_pos)
        currTree.createFolder(p, genItemId(), rid, d.title, true, settings.saving_new_pos);
        currTree.onXmlChanged();
    }).catch(()=>{});
};
menulistener.onCreateSeparator = function(){
    currTree.createSeparator(currTree.getCurrContainer(), genItemId(), currTree.getCurrRefId(), true, settings.saving_new_pos);
    currTree.onXmlChanged();
};
menulistener.onCreateNote = function(){
    var id = genItemId();
    var path = `${currTree.rdfPath}/data/${id}/index.html`;
    browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE',
                                 text: "<title>New Note</title>New Note",
                                 path: path}).then((response) => {
                                     currTree.createLink(currTree.getCurrContainer(), {
                                         type: "note",
                                         id: id,
                                         ref_id: currTree.getCurrRefId(),
                                         title: "New Note",
                                     },{
                                         wait: false,
                                         is_new: true,
                                         pos: settings.saving_new_pos
                                     });
                                     currTree.onXmlChanged();
                                 });
}
menulistener.onOpenOriginLink = function(){
    var $foc = currTree.getFocusedItem();
    var url = $foc.attr("source");
    var method = settings.open_in_current_tab == "on" ? "update" : "create";
    browser.tabs[method]({ url: url }, function(tab){});
};
menulistener.onDebug = function(){};
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
        var t = type.replace(/^\w/, function(a){return a.toUpperCase();});
        t = `{${t}}`.translate();
        var opt = {dlg_title:"{Properties}".translate(), title: (t0 || ""),
                   url: s0, id, time, type:t,
                   display_url: type == "folder" || type == "note" ? "none" : "",
                   display_icon: type == "folder" || type == "note" ? "none" : "",
                   comment: c0, tag: tag0, icon: icon0};
        showDlg("property", opt, function($dlg){
            $dlg.find("span[name=btnDefaultIcon]").click(function(){
                $("input[name=icon").val(`resource://scrapbook/data/${id}/favicon.ico`);
                return false;
            });
            $dlg.find("span[name=btnClearIcon]").click(function(){
                $("input[name=icon").val('');
                return false;
            });
        }).then(function(d){            
            var t1 = d.title;
            if(t1 != t0){
                currTree.renameItem($foc, t1);
            }
            var s1 = d.url;
            if(s1 != s0 && opt.display_url == ""){
                currTree.updateSource($foc, s1);
            }
            var c1 = d.comment;
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
            if(t1 != t0 || s1 != s0 || c1 != c0 || icon1 != icon0){ //  || tag1 != tag0
                currTree.onXmlChanged();
            }
        }).catch(()=>{});
    }
};
menulistener.onOpenFolder = function(){
    if($(".item.focus").length){
        var id = $(".item.focus").attr("id");
        var path = currTree.getItemFilePath(id);        
        $.post(settings.getBackendAddress() + "filemanager/", {path, pwd:settings.backend_pwd}, function(r){});
    }
};
var drop;
function showRdfList(){
    log.info("show rdf list");

    new History().load().then((self)=>{
        var lastRdf = self.getItem("sidebar.tree.last");
        var saw = false;
        var paths = settings.getRdfPaths();
        if(paths.length == 0)
            $(".folder-content.toplevel").html("{NO_RDF_SETTED_HINT}".translate());
        drop = drop || new SimpleDropdown($(".drop-button")[0], []);
        drop.clear();
        drop.onchange=(function(title, value){
            $(".drop-button .label").text(title || "");
            if(value !== null)switchRdf(value);  // switch rdf and notify other side bar.
        });
        if(paths){
            var names = settings.getRdfPathNames(); 
            names.forEach(function(name, i){
                log.debug(`append dropdown item: '${paths[i]}' as '${name}'`);
                if(!saw && typeof lastRdf != "undefined" && paths[i] == lastRdf){
                    saw = true;
                    try{
                        drop.select(name, paths[i]);
                    }catch(e){
                        log.error(e.message);
                    }
                }
                try{
                    drop.addItem(name, paths[i]);
                }catch(e){
                    log.error(e.message);
                }            
            });
            if(!saw){
                drop.select(names[0], paths[0]);
            }
        }

    });

}
function applyAppearance(){
    var id = "scrapbee_setting_style";
    $("#"+id).remove();
    var sheet = document.createElement('style');
    sheet.id=id;
    var item_h = parseInt(settings.font_size);
    var line_spacing = parseInt(settings.line_spacing);
    var icon_h = parseInt(settings.font_size) * 1.2;
    var icon_space = icon_h + 2;
    var origin_h = parseInt(settings.font_size) * 0.80;
    var bg_color = settings.bg_color;
    // var filter = getColorFilter("#"+settings.font_color).filter;
    sheet.innerHTML = `
*{
  color:${settings.font_color};
  font-family:${settings.font_name};
}
.item.local,.item.folder{
  color:#${settings.font_color};
}
.item.bookmark label{
  color:#${settings.bookmark_color};
}
.toolbar{
  backgroud-color:#${bg_color};
}
body{
  background:#${bg_color};
}
.dlg-cover{
  background:#${bg_color}99;
}
.toolbar{
  border-color:#${settings.font_color};
  background:#${bg_color};
}
.item.separator.focus > .stroke{
  background:#${settings.focused_fg_color};
  border-color:#${settings.focused_bg_color};
}
.item.page,.item.bookmark,.item.folder{
  000padding-left:${icon_space}px;
  background-size:${icon_h}px ${icon_h}px;
}
.item.page label,.item.bookmark  label,.item.folder label{
  font-size:${settings.font_size}px;
}
.item.page i,.item.bookmark i,.item.folder i,.item.note i{
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
.simple-menu-item{
  border-color:#${settings.font_color};
  color:#${settings.font_color}
}
.simple-dropdown, .simple-menu{
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
.simple-menu-item:hover,
.tool-button:hover{
  background-color:#${settings.focused_bg_color};
  color:#${settings.focused_fg_color};
}
.tool-button:hover:before,.simple-menu-item:hover .icon{
  background-color:#${settings.focused_fg_color};
}
.tool-button:before,.simple-menu-item .icon{
  background-color:#${settings.font_color};
}`;
    document.body.appendChild(sheet);
}
settings.onchange=function(key, value){
    if(key == "rdf_path_names" || key == "rdf_paths"){
        showRdfList();
    }else if(key == "sidebar_show_root"){
        currTree.showRoot(value == "on");
    }else if(key == "font_size" || key == "line_spacing" || key == "font_name" || key.match(/\w+_color/)){
        applyAppearance();
    }else if(key == "backend"){
        $(".folder-content.toplevel").empty().text("{Loading...}".translate());
        browser.runtime.sendMessage({type: 'WAIT_WEB_SERVER', try_times: 10}).then((response) => {
            loadAll();
        }).catch((e) => {
            log.error("failed to start backend, please check installation and settings");
            $(".folder-content.toplevel").html("{FAIL_START_BACKEND_HINT}".translate());
        });
    }
};
/* on page loaded */
function loadAll(){    
    /** rdf list */
    showRdfList(); /** this will trigger loading a rdf initially */
    /** open file manager */
    $("#btnFileManager").click(function(){
        var rdfPath = currTree.rdfPath;
        $.post(settings.getBackendAddress() + "filemanager/", {path:rdfPath, pwd:settings.backend_pwd}, function(r){
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
        if(drop && drop.value)loadXml(drop.value);
    };
    var btn = document.getElementById("btnSet");
    btn.onclick = function(){
        browser.tabs.create({
            "url": "options.html"
        });
    };
    var btn = document.getElementById("btnTools");
    btn.onclick = function(){
        browser.tabs.create({
            "url": "options.html#area=tools"
        });
    };    
    var btn = document.getElementById("btnHelp");
    btn.onclick = function(){
        browser.tabs.create({
            "url": "options.html#area=help"
        });
    };
    var btn = document.getElementById("btnSearch");
    btn.onclick = function(){
        browser.tabs.create({
            "url": "search.html?rdf=" + currTree.rdf
        });
    };
    /** context menu */
    var items = [
        {value: "menuProperty", icon:"/icons/property.svg", title: "{Properties}"},
        {value: "menuOpenOriginLink", icon:"/icons/open_origin.svg", title: "{OPEN_ORIGIN_LINK}"},
        {value: "menuOpenFolder", icon:"/icons/openfolderblack.svg", title: "{Open Folder}"},
        {value: "menuOpenAll", icon:"/icons/openall.svg", title: "{OPEN_ALL_ITEMS}"},
        {value: "menuCreateFolder", icon:"/icons/folder.svg", title: "{New Folder}"},
        {value: "menuCreateSeparator", icon:"/icons/separator.svg", title: "{New Separator}"},
        {value: "menuCreateNote", icon:"/icons/note.svg", title: "{New Note}"},
        {value: "menuDelete", icon:"/icons/delete.svg", title: "{Delete}"},
        {value: "menuSort1", icon:"/icons/sort_a_z.svg", title: "{Sort}"},
    ];
    items.forEach(function(v, i){
        items[i]["title"]= v.title.translate()
    });
    document.body.ctxMenu = new ContextMenu(items);
    document.body.ctxMenu.onselect = function(title, value){
        if(currTree){
            var listener = menulistener[value.replace(/^menu/, "on")];
            if(listener)listener();
        }
    }
    /**  */
    applyAppearance();
    browser.runtime.sendMessage({type: 'WAIT_WEB_SERVER', try_times: 10}).then((response) => {
        loadAll();
    }).catch((e) => {
        log.error("failed to start backend, please check installation and settings");
        $(".folder-content.toplevel").html("{FAIL_START_BACKEND_HINT}".translate());
    });
    /** announcement */
    new History().load().then((self)=>{
        var ann = browser.i18n.getMessage("announcement_version")
        var showed = self.getItem("announce.version_showed") || "";
        if(gtv(ann, showed)){
            $("#announcement-red-dot").show();
        }else{
            $("#announcement-red-dot").hide();
        }
        $("#announcement-red-dot").parent().click(function(){
            self.setItem('announce.version_showed', ann);
            $("#announcement-red-dot").hide();
        });
    });
    /** toggle root */
    $("#show-root").change(function(){
        currTree.showRoot(this.checked);
    });
};
function loadXml(rdf){
    currTree = null;
    if(!rdf) return Promise.reject(Error("invalid rdf path"));
    return new Promise((resolve, reject) => {
        $(".folder-content.toplevel").empty().text("{Loading...}".translate());
        var rdfPath = rdf.replace(/[^\/\\]*$/, "");
        var rdf_file = rdf.replace(/.*[\/\\]/, "");
        var xmlhttp=new XMLHttpRequest();
        xmlhttp.onload = async function(r) {
            try{
                var _begin = new Date().getTime();
                currTree = new BookTree(r.target.response, rdf);
                await currTree.renderTree($(".folder-content.toplevel"), settings.sidebar_show_root == "on");
                currTree.toggleFolder(currTree.getItemById("root"), true);
                var cost = new Date().getTime() - _begin;
                log.info(`rdf loaded in ${cost}ms`);
            }catch(e){
                log.error(e.message);
                return;
            }
            currTree.onXmlChanged = currTree.onDragged = function(){
                log.info(`saving changes to rdf`);
                browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE',
                                             text: currTree.xmlSerialized(),
                                             path: currTree.rdf,
                                             backup: true,
                                             boardcast: true,
                                             srcToken: currTree.unique_id}).then((response) => {
                    log.info(`rdf updated`);
                }).catch(e => {
                    log.error(`failed to update rdf: ${e}`);
                });
            };
            currTree.onItemRemoving=function(id){
                return ajaxFormPost(settings.getBackendAddress() + "deletedir/", {path: rdfPath + "data/" + id, pwd:settings.backend_pwd});
            };
            currTree.onOpenContent=function(itemId, url, newTab, isLocal){
                var method = newTab ? "create" : "update";
                if(/^file\:/.test(url)){
                    url = settings.getFileServiceAddress() + url.replace(/.{7}/,'');
                }
                if(isLocal)
                    browser.tabs[method]({url: `/html/viewer.html?id=${itemId}&path=${rdfPath}`}, function (tab) {});
                else
                    browser.tabs[method]({url: url}, function (tab) {});
            };
            document.body.addEventListener("mousedown", function(e){
                if(e.button == 2 && this.ctxMenu){
                    var left = e.clientX;
                    var top = e.clientY;
                    if(this.ctxMenu.width + left > document.body.clientWidth){
                        left = document.body.clientWidth - this.ctxMenu.width;
                    }
                    if(this.ctxMenu.height + top > document.body.clientHeight){
                        top = document.body.clientHeight - this.ctxMenu.height;
                    }
                    left = Math.max(0, left);
                    top = Math.max(0, top);
                    this.ctxMenu.show(left, top)
                }
            })
            currTree.onChooseItem=function(id){
                var $f = currTree.getItemById(id);
                var menu = document.body.ctxMenu;
                menu.hideAllItems();
                if ($f.hasClass("folder")) {
                    menu.showItems(["menuProperty", "menuDelete", "menuCreateFolder", "menuCreateSeparator", "menuCreateNote", "menuSort1", "menuOpenAll"])
                } else if ($f.hasClass("separator")) {
                    menu.showItems(["menuDelete", "menuCreateFolder", "menuCreateSeparator", "menuCreateNote", "menuSort1"])
                } else if ($f.hasClass("item")) {
                    menu.showItems(["menuOpenOriginLink", "menuProperty", "menuDelete", "menuCreateFolder",
                                    "menuCreateSeparator", "menuCreateNote","menuOpenFolder", "menuSort1", ])                    
                    if($f.hasClass("bookmark")){
                        menu.hideItem("menuOpenOriginLink");
                    }
                } else {
                    menu.showItems(["menuCreateFolder", "menuCreateSeparator", "menuCreateNote", "menuSort1"])
                }
                new History().load().then((self)=>{
                    var v = self.getItem("sidebar.nodes.focused") || {};
                    v[rdf] = id;
                    self.setItem("sidebar.nodes.focused", v); 
                });
            };
            currTree.onToggleFolder=function(){
                var folderIds = currTree.getExpendedFolderIds().join(",");
                new History().load().then((self)=>{
                    var v = self.getItem("sidebar.folders.opened") || {};
                    v[rdf] = folderIds;
                    self.setItem("sidebar.folders.opened", v); 
                });
            };
            /** restore status */
            currTree.restoreStatus=function(){
                new History().load().then((self)=>{
                    var v = self.getItem("sidebar.folders.opened") || {};
                    var folders = v[rdf];
                    if(folders){
                        folders.split(",").forEach(function(id){
                            currTree.toggleFolder(currTree.getItemById(id), true);
                        });
                    }
                    var v = self.getItem("sidebar.nodes.focused") || {};
                    var id = v[rdf];
                    if(id){
                        var $item = currTree.getItemById(id);
                        if($item.length){
                            currTree.focusItem($item);
                            currTree.scrollToItem($item, 500, $(".toolbar").height() + 5, false);
                        }
                    }
                });
            }
            currTree.restoreStatus();
            /** history */
            new History().load().then((self)=>{
                self.setItem("sidebar.tree.last", rdf); 
            });
            resolve(currTree);
        };
        xmlhttp.onerror = function(err) {
            $(".folder-content.toplevel").html("{FAIL_START_BACKEND_HINT}".translate());
            log.error(`failed to load ${rdf}`);
            reject(err)
        };
        xmlhttp.open("GET", settings.getFileServiceAddress() + rdf, false);
        xmlhttp.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
        xmlhttp.setRequestHeader('cache-control', 'max-age=0');
        xmlhttp.setRequestHeader('expires', '0');
        xmlhttp.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
        xmlhttp.setRequestHeader('pragma', 'no-cache');
        xmlhttp.send();
    });
}
function switchRdf(rdf){
    log.info(`switch to rdf "${rdf}"`);
    return new Promise((resolve, reject) => {
        currTree = null;
        if(!$.trim(rdf)){
            $(".folder-content.toplevel").empty().text("Invaid rdf path.");
            reject();
        }
        $(".folder-content.toplevel").html("{Loading...}".translate());
        /** check rdf exists */
        touchRdf(settings.getBackendAddress(), rdf, settings.backend_pwd).then(function(r){
            loadXml(rdf).then(()=>{
                resolve();
            });
        });
    })
}
function requestUrlSaving(itemId){
    withCurrTab(function(tab){
        var icon = tab.favIconUrl;
        var ref_id;
        function saveIcon(){
            return new Promise((resolve, reject)=>{
                if(icon && icon.match(/^data:image/i)){
                    var filename = `${currTree.rdfPath}/data/${itemId}/favicon.ico`;
                    $.post(settings.getBackendAddress() + "download", {url: icon, itemId, filename, pwd: settings.backend_pwd}, function(r){
                        icon = "resource://scrapbook/data/" + itemId + "/favicon.ico";
                        resolve();
                    });
                }else{
                    resolve();
                }
            });
        }
        saveIcon().then(() => {
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
               $container = $(".folder-content.toplevel");
           }
           currTree.createLink(currTree.getCurrContainer(), {
               type:"bookmark",
               title:tab.title,
               id:itemId,
               ref_id:currTree.getCurrRefId(),
               source:tab.url,
               icon,
           }, {
               wait:false,
               is_new:true,
               pos: settings.saving_new_pos
           });
           currTree.onXmlChanged();
           showNotification({message: `Save bookmark "${tab.title}" done`, title: "Info"});
        })
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
                refreshTree(currTree, loadXml, currTree.rdf);
                // loadXml(currTree.rdf);
            }
        }
    }else if(request.type == 'SAVE_URL_REQUEST'){
       if(currTree && currTree.rendered) {
           browser.windows.getLastFocused().then(function(win){
               if(win.id == thisWindowId)
                   requestUrlSaving(genItemId());
           });
       }else{
           log.error("rdf have not been loaded");
       }
    }else if(request.type == 'CREATE_MIRROR_NODE'){
        if(currTree && currTree.rendered && request.rdf == currTree.rdf){
            /** do not trigger rdf saving */
            currTree.createLink(currTree.getContainerById(request.folderId), {
                type: request.nodeType,
                title: request.title,
                id: request.itemId,
                ref_id: request.refId,
                source: request.url,
                icon: request.ico,
                comment: request.comment
            },{
                wait: true,
                is_new: true,
                pos: settings.saving_new_pos
            });
        }
    }else if(request.type == 'REMOVE_FAILED_NODE'){
        if(currTree && currTree.rendered && request.rdf == currTree.rdf){
            currTree.updateItemIcon($("#"+request.itemId), icon);
            currTree.removeItem($("#"+request.itemId));
        }
    }else if(request.type == 'UPDATE_FINISHED_NODE'){
        /** update node in sidebar only in the same window, sidebar in other windows will reloaded after icon updated */
        if(currTree && currTree.rendered && request.rdf == currTree.rdf){
            var icon = request.haveIcon ? "resource://scrapbook/data/" + request.itemId + "/favicon.ico" : "";
            currTree.updateItemIcon($("#"+request.itemId), icon);
            currTree.unlockItem($("#"+request.itemId));
            if(sender.tab.windowId == thisWindowId)
                currTree.onXmlChanged();
        }
    }else if(request.type == 'CREATE_NODE_REQUEST'){
        return new Promise((resolve, reject) => {
            if(sender.tab.windowId == thisWindowId){
                if(currTree && currTree.rendered) {
                    try{
                        var itemId = genItemId();
                        var icon = request.haveIcon ? "resource://scrapbook/data/" + request.itemId + "/favicon.ico" : "";
                        /** do not trigger rdf saving */
                        currTree.createLink(currTree.getCurrContainer(), {
                            type: request.nodeType,
                            id: itemId,
                            ref_id: currTree.getCurrRefId(),
                            source: request.url,
                            title: request.title,
                            icon,
                        },{
                            wait: true,
                            is_new: true,
                            pos: settings.saving_new_pos
                        });
                        resolve({rdf:currTree.rdf, rdfPath:currTree.rdfPath, itemId});
                    }catch(e){
                        reject(e)
                    }
                }else{
                    reject(Error("rdf have not been loaded"));
                }
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
browser.windows.getCurrent({populate: true}).then((windowInfo) => {
    thisWindowId = windowInfo.id;
});
document.oncontextmenu = function (event){
    if($(".dlg-cover:visible").length == 0)
        return false
}
console.log("==> main.js loaded");
