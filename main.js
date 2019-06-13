import {BookTree} from "./tree.js";
import {settings} from "./settings.js"
import {scriptsAllowed, showNotification, getColorFilter, genItemId} from "./utils.js"
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
function getCurrContainer(){
    var $container;
    var $f = $(".item.focus");
    if($f.length){
    	if($f.hasClass("folder")){
    	    $container = $f.next(".folder-content");
    	}else{
    	    $container = $f.parent(".folder-content");
    	}
    }else{
    	$container = $(".root.folder-content");
    }
    return $container;;
}
function getCurrRefId(){
    var $f = $(".item.focus");
    if($f.length){
    	if(!$f.hasClass("folder")){
    	    return $f.attr("id");
    	}
    }
}
function showDlg(name, data){
    if($(".dlg-cover:visible").length)
	return Promise.reject(Error("only one alert dialog can be showed"))
    var $dlg = $(".dlg-cover.dlg-" + name).clone().appendTo(document.body);
    $dlg.show();
    data = data||{}
    $dlg.html($dlg.html().replace(/\[([^\[\]]+?)\]/g, function(a, b){
	return data[b] || ""
    }));
    $dlg.find("input").each(function(){
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
    $dlg.find("input.button-ok").unbind(".dlg");
    $dlg.find("input.button-cancel").unbind(".dlg");
    /** return promise object */
    var p = new Promise(function(resolve, reject){
	$dlg.find("input.button-ok").bind("click.dlg", function(){
	    var data = {};
	    $dlg.find("input").each(function(){
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
    return p;
}
function alert(title, message){
    return showDlg("alert", {title:title.translate(), message:message.translate()});
}
function confirm(title, message){
    return showDlg("confirm", {title:title.translate(), message:message.translate()});
}
/* context menu listener */
var menulistener={};
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
	    p = getCurrContainer(); 
	}
    	currTree.createFolder(p, genItemId(), getCurrRefId(), d.title, true);
    });
}
menulistener.onCreateSeparator = function(){
    currTree.createSeparator(getCurrContainer(), genItemId(), getCurrRefId(), true);
}
menulistener.onDebug = function(){}
menulistener.onRename = function(){
    if($(".item.focus").length){
    	var $label = $(".item.focus label");
    	var t0 = $(".item.focus").attr("title");
	showDlg("prompt", {pos:"root", title: t0.htmlDecode()}).then(function(d){
	    var t1 = d.title.htmlEncode();
	    if(t1 != t0){
   		currTree.renameItem($(".item.focus"), t1);
	    }
	});
    }
}
menulistener.onOpenFolder = function(){
    if($(".item.focus").length){
    	var id = $(".item.focus").attr("id");
        var path = currTree.getItemFilePath(id);
        $.post(settings.backend_url + "filemanager/", {path:path}, function(r){
	    // 
	});
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
    sheet.innerHTML=`
*{color:${settings.font_color}}
.item.local,.item.folder{color:#${settings.font_color}}
.item.bookmark label{color:#${settings.bookmark_color}}
.toolbar{backgroud-color:#${bg_color}}
body{background:#${bg_color}}
.dlg-cover{background:#${bg_color}99}
.toolbar{border-color:#${settings.font_color};background:#${bg_color}}
.item.separator{border-color:#${bg_color};background:#${settings.separator_color}}
.tool-button{background:#${settings.font_color}}
.item.local,.item.bookmark,.item.folder{padding-left:${icon_space}px;
background-size:${icon_h}px ${icon_h}px;font-size:${settings.font_size}px;}
.folder-content{margin-left:${item_h}px}
.item .origin{width:${origin_h}px;height:${origin_h}px;mask-size:${origin_h}px ${origin_h}px;background:#${settings.font_color}}
.item{margin-top:0 !important;margin-bottom:${line_spacing}px !important}
.simple-menu-button:{border-color:#${settings.font_color}}
.simple-menu{background:#${bg_color};border-color:#${settings.font_color}}
.drop-button{border-color:#${settings.font_color}}
.drop-button .label{color:#${settings.font_color}}
.drop-button .button{border-color:#${settings.font_color}; color:#${settings.font_color}}
.tool-button:hover,.item.folder.focus label, .item.bookmark.focus label, .item.local.focus label,.simple-menu div:hover{background-color:#${settings.selection_color}}
`
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
	var rdf_path=currTree.rdf_path;
	$.post(settings.backend_url + "filemanager/", {path:rdf_path}, function(r){
	    // 
	});
    });
}
window.onload=async function(){
    await settings.loadFromStorage();
    document.title = document.title.translate();
    document.body.innerHTML = document.body.innerHTML.translate();
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
    	    "url": "search.html"
        });
    }
    $("menuitem").click(function(e){
	var listener = menulistener[this.id.replace(/^menu/, "on")];
	listener && listener();
    });    
    /**  */
    applyAppearance();
    browser.runtime.sendMessage({type: 'START_WEB_SERVER_REQUEST', port: settings.backend_port}).then((response) => {
        loadAll();
    });
    /** announcement */
    function getVersionParts(v){
        var m = String(v).match(/(\d+)\.(\d+)\.(\d+)/)
        if(m){
            return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])]
        }else{
            return [0, 0, 0]
        }
    }
    var ann = browser.i18n.getMessage("announcement_content")
    var m = ann.match(/#(\d+\.\d+\.\d+)#/)
    if(m){
        var a = getVersionParts(settings.announcement_showed)
        var b = getVersionParts(m[1])
        if(gtv(b, a)){
            $("#announcement-red-dot").show()
        }else{
            $("#announcement-red-dot").hide()
        }
        function gtv(b, a){
            for(var i=0; i<b.length; i++){
                if(b[i] > a[i]){
                    return true;
                }else if(b[i] < a[i]){
                    return false
                }
            }
            return false;
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
    var rdf_path = rdf.replace(/[^\/\\]*$/, "");
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
            log.info(`saving changes to rdf`);
            browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: currTree.xmlSerialized(), path: currTree.rdf}).then((response) => {
                browser.runtime.sendMessage({type: 'RDF_EDITED', rdf: currTree.rdf}).then((response) => {});
	        log.info(`save changes to rdf, done`);
            });
	}
	currTree.onItemRemoved=function(id){
	    $.post(settings.backend_url + "deletedir/", {path: rdf_path + "data/" + id}, function(r){});
	}
	currTree.onOpenContent=function(itemId, url, newTab, isLocal){
            var method = newTab ? "create" : "update";
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
	    currTree.createLink(getCurrContainer(), "bookmark", itemId, getCurrRefId(), tab.url, icon, tab.title, false, true);
	    showNotification({message: `Capture url "${tab.title}" done`, title: "Info"});
	}
	if(icon.match(/^data:image/i)){
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
function executeScriptsInTab(tab_id, files){
    return new Promise((resolve, reject) => {
        function sendone(){
            if(files.length){
                var f = files.shift();
                browser.tabs.executeScript(tab_id, {file: f}).then(() => {
                    sendone();
                }).catch(reject);
            }else{
                resolve();
            }
        }
        sendone();
    })
}
function requestPageSaving(itemId, selection){
    return new Promise((resolve, reject) => {
        withCurrTab(async function(tab){
            var ico = "icons/loading.gif"
            if (!(await scriptsAllowed(tab.id))) {
	        var err = "Add-on content script is not allowed on this page";
	        log.error(err)
	        showNotification({message: err, title: "Error"});
	        reject()
            }else{
                log.debug("status", tab.status)
                if(tab.status == "loading"){
                    showNotification({message: `Waiting for page loading, please do not make any options on this page before capturing finished`, title: "Info"});
                }
                executeScriptsInTab(tab.id, [
                    "libs/mime.types.js",
                    "libs/jquery-3.3.1.js",
                    "libs/md5.js",
                    "proto.js",
                    "dialog.js",
                    "content_script.js"
                ]).then(function(){
                    currTree.createLink(getCurrContainer(), "local", itemId, getCurrRefId(), tab.url, ico, tab.title, true, true);
                    log.debug("content scripts injected")
                    browser.tabs.sendMessage(tab.id, {type: selection?'SAVE_PAGE_SELECTION':'SAVE_PAGE', rdf_path: currTree.rdf_path, scrapId: itemId}).then(function(){
                        var item = {}
                        item.tabId = tab.id;
                        item.id = itemId;
                        resolve(item);
                    }).catch((err) => {
                        currTree.removeItem($("#"+itemId))
                        log.debug(err.message)
                    });
                }).catch((err) => {
                    log.error(err.message)
                });
            }
        });
    });
}
function updateMenuItem(t){
    browser.contextMenus.removeAll(function(){
        browser.contextMenus.create({id: "catch", title: `catch ${t}`, onclick:function(){}});
    });
}
function getFocusedWindow(callback){
    // return browser.windows.getLastFocused().then((win) => callback(win));
}
/* receive message from background page */
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if(request.type == 'UPDATE_CONTEXTMENU_REQUEST'){
    }else if(request.type == 'GET_OTHER_INSTANCE_REQUEST'){
	browser.runtime.sendMessage({session_id:request.session_id});
    }else if(request.type == 'RDF_EDITED'){
	if(request.rdf == currTree.rdf){
	    alert("{Warning}", "{SAME_RDF_MODIFIED}").then(function(r){
		loadXml(currTree.rdf);	
	    });
	}
    }else if(request.type == 'SAVE_PAGE_SELECTION_REQUEST'){
	if(currTree && currTree.rendered) {
	    browser.windows.getLastFocused().then(function(win){
		if(win.id == thisWindowId){
		    requestPageSaving(genItemId(), true).then((item) => {
		        var icon = "resource://scrapbook/data/" + item.id + "/favicon.ico";
		        $("#"+item.id).removeAttr("disabled");
		        currTree.updateItemIcon($("#"+item.id), icon);
	            });
		}
	    });
	}else{
	    log.error("rdf have not been loaded")
	}
    }else if(request.type == 'SAVE_PAGE_REQUEST'){
	if(currTree && currTree.rendered) {
	    browser.windows.getLastFocused().then(function(win){
		if(win.id == thisWindowId){
		    requestPageSaving(genItemId(), false).then((item) => {
                      	var icon = "resource://scrapbook/data/" + item.id + "/favicon.ico";
		        $("#"+item.id).removeAttr("disabled");
		        currTree.updateItemIcon($("#"+item.id), icon);
	            });
		}
	    });
	}else{
	    log.error("rdf have not been loaded")
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
    }
});
function postBlob(url, blob, filename, itemId, onload, onerror){
    var rdf_path = currTree.rdf_path;
    var formData = new FormData();
    formData.append("filename", `${rdf_path}/data/${itemId}/${filename}`);
    formData.append("file", blob);   // add file object
    var request = new XMLHttpRequest();
    request.open("POST", url, false);
    // request.responseType='text';
    request.onload = function(oEvent) {
	onload && onload();
    };
    request.onerror = function(oEvent) {
	onerror && onerror();
    };    
    request.send(formData);
}
document.addEventListener('contextmenu', function(event){
    if($(".dlg-cover:visible").length)
	event.preventDefault()
    return false;
});
browser.windows.getCurrent({populate: true}).then((windowInfo) => {
    thisWindowId = windowInfo.id;
});

document.addEventListener('keydown', function(event){
    console.log(event.code)
    return false;
});

console.log("==> main.js loaded");
