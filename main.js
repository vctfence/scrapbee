import {BookTree} from "./tree.js";
import {msg_hub, log, settings} from "./global.js"
import {scriptsAllowed, showNotification} from "./utils.js"
import {getMainMimeExt} from "./libs/mime.types.js"

var currTree;
var windowId;

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
function genItemId(){
    return new Date().format("yyyyMMddhhmmss");
}
function saveRdf(){
    log("info", `saving changes to rdf`);
    var rdf=currTree.rdf;
    $.post(settings.backend_url + "savefile", {filename:rdf, content: currTree.xmlSerialized()}, function(r){
	msg_hub.send('RDF_EDITED', {windowId: windowId, rdf: rdf});
	log("info", `save changes to rdf, done`);
    });
}
function initRdf(rdf, callback){
    var content = '<?xml version="1.0"?>\
<RDF:RDF xmlns:NS1="scrapbee@126.com" xmlns:NC="http://home.netscape.com/NC-rdf#" xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\
<RDF:Seq RDF:about="urn:scrapbook:root"></RDF:Seq>\
</RDF:RDF>';
    $.post(settings.backend_url + "savefile", {filename:rdf, content: content}, function(r){
	callback && callback();
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
function showDlg(name, data, callback){
    if($(".dlg-cover:visible").length)
	return
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
	    // callback && callback(data);
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
	currTree.removeItem($(".item.focus"), function(){
	    saveRdf(); // all done (all sub nodes removed)
	});
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
    	saveRdf();
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
   		currTree.renameItem($(".item.focus"), t1, function(){
    		    saveRdf();
    		});
	    }
	});
    }
}
function showRdfList(){
    var lastRdf = settings.last_rdf;
    var names = settings.rdf_path_names;
    $("#listRdf").html("");
    var saw = false;
    var paths = settings.getRdfPaths();
    if(paths){
	settings.getRdfPathNames().forEach(function(n, i){
	    var $opt = $("<option></option>").appendTo($("#listRdf")).html(n).attr("value", paths[i]);
	    if(!saw && typeof lastRdf != "undefined" && paths[i] == lastRdf){
		saw = true;
		$opt.attr("selected", true);
	    }
	});
	switchRdf($("#listRdf").val());
    }
}
function applyColor(){
    var bg_color = settings.bg_color;
    if(bg_color && bg_color.isHexColor()){
	$(document.body).css("background-color", bg_color);
	$(".toolbar").css("background-color", bg_color);
    }
    var id = "scrapbee_setting_style";
    $("#"+id).remove();
    var sheet = document.createElement('style');
    sheet.id=id;
    sheet.innerHTML = [
	"*{color:", settings.font_color, "}",
	".item.folder{color:", settings.font_color, "}",
	".item.local label{color:", settings.font_color, "}",
	".item.bookmark label{color:", settings.bookmark_color, "}",
	".toolbar{backgroud-color:", settings.bg_color, "}",
	"body{backgroud-color:", settings.bg_color, "}",
	".item.separator{border-color:", settings.bg_color, ";background:", settings.separator_color, "}"
    ].join("");
    document.body.appendChild(sheet);
}
window.addEventListener("storage", function(e){
    if(e.key == "rdf_path_names" || e.key == "rdf_paths"){
	showRdfList();
    }else if(e.key.match(/\w+_color/)){
	applyColor();
    }else if(e.key == "last_rdf"){
    }else if(e.key == "backend_port"){
	msg_hub.send('START_WEB_SERVER_REQUEST', {port: settings.backend_port}, function(){
	    loadAll();
	});
    }
});
/* on page loaded */
function loadAll(){    
    /** rdf list */
    showRdfList(); /** this will trigger loading a rdf initially */
    $("#listRdf").change(function(){
	switchRdf(this.value);  // switch rdf and notify other side bar.
    });
    /**  */
    applyColor();
    /** open file manager */
    $("#btnFileManager").click(function(){
	var rdf_path=currTree.rdf_path;
	$.post(settings.backend_url + "filemanager/", {path:rdf_path}, function(r){
	    // 
	});
    });
}
window.onload=function(){
    /* i18n */
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
    // $(".i18n").each(function(i, item){
    // 	if(/i18n-(\w+)/.test(item.className)){
    // 	    item[RegExp.$1] = browser.i18n.getMessage(item[RegExp.$1]) || item[RegExp.$1];
    // 	}
    // });
    $("menuitem").click(function(e){
	var listener = menulistener[this.id.replace(/^menu/, "on")];
	listener && listener();
    });    
    if(settings.debug)
	loadAll();

    // browser.runtime.sendMessage({type: 'START_WEB_SERVER_REQUEST'});
    msg_hub.send('START_WEB_SERVER_REQUEST', {port: settings.backend_port}, function(){
	loadAll();
    });
}
function loadXml(rdf){
    currTree=null;
    if(!rdf)return;
    $(".root.folder-content").html("Loading...");
    var rdf_path = rdf.replace(/[^\/\\]*$/, "");
    var rdf_file = rdf.replace(/.*[\/\\]/, "");    
    var xmlhttp=new XMLHttpRequest();
    xmlhttp.onload = function(r) {
	try{
	    currTree = new BookTree(r.target.response, rdf)
	    currTree.renderTree();
	}catch(e){
	    log("error", e.message)
	}
	log("info", `rdf "${rdf}" loaded`)
	currTree.onXmlChanged=function(){
	    saveRdf();
	}
	currTree.onItemRemoved=function(id){
	    $.post(settings.backend_url + "deletedir/", {path: rdf_path + "data/" + id}, function(r){});
	}
    };
    xmlhttp.onerror = function(err) {
	log("info", `load ${rdf} failed, ${err}`)
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
    log("info", `switch to rdf "${rdf}"`)
    settings.set('last_rdf', rdf);
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
	    try{
		$(".root.folder-content").html(`Rdf {File} ${rdf} {NOT_EXISTS}, {CREATE_OR_NOT}? `.translate())
	    }catch(e){
		log("info", e.message)
	    }
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
	    saveRdf();
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
function requestPageSaving(itemId, type){
    withCurrTab(async function(tab){
	var ico = "icons/loading.gif"
	try{
	    if (!(await scriptsAllowed(tab.id))) {
		var err = "Content script is not allowed on this page";
		log("error", err)
		await showNotification({message: err, title: "Error"});
		return;
	    }
	    currTree.createLink(getCurrContainer(), "local", itemId, getCurrRefId(), tab.url, ico, tab.title, true, true);
            browser.tabs.sendMessage(tab.id, {type: type, itemId: itemId, windowId: windowId}, null);
	}catch(e){
	    log("error", e.message)
	}
    });
}
function updateMenuItem(t){
    browser.contextMenus.removeAll(function(){
        browser.contextMenus.create({id: "catch", title: `catch ${t}`, onclick:function(){}});
    });
}
function withFocusedWindow(callback){
    browser.windows.getLastFocused().then((win) => callback(win));
}
/* receive message from background page */
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if(request.type == 'UPDATE_CONTEXTMENU_REQUEST'){
    }else if(request.type == 'SAVE_CONTENT' && request.windowId == windowId){
	savePage(request.itemId, request.content.title, request.content.html, request.content.css, request.content.res, function(){
	    browser.tabs.sendMessage(sender.tab.id, {type: 'SAVE_CONTENT_FINISHED', itemId: request.itemId, title: request.content.title}, null);
	});
    }else if(request.type == 'GET_OTHER_INSTANCE_REQUEST'){
	browser.runtime.sendMessage({session_id:request.session_id});
    }else if(request.type == 'RDF_EDITED'){
	if(request.content.rdf == currTree.rdf){
	    alert("{Warning}", "{SAME_RDF_MODIFIED}").then(function(r){
		loadXml(currTree.rdf);	
	    });
	}
    }else if(request.type == 'SAVE_PAGE_SELECTION_REQUEST'){
	if(currTree && currTree.rendered) {
	    withFocusedWindow(function(win){
		if(win.id == windowId)
		    requestPageSaving(genItemId(), 'GET_PAGE_SELECTION_REQUEST');
	    });
	}else{
	    log("error", "rdf have not been loaded")
	}
    }else if(request.type == 'SAVE_PAGE_REQUEST'){
	if(currTree && currTree.rendered) {
	    withFocusedWindow(function(win){
		if(win.id == windowId){
		    requestPageSaving(genItemId(), 'GET_PAGE_REQUEST');
		}
	    });
	}else{
	    log("error", "rdf have not been loaded")
	}
    }else if(request.type == 'SAVE_URL_REQUEST'){
	if(currTree && currTree.rendered) {
	    withFocusedWindow(function(win){
		if(win.id == windowId)
		    requestUrlSaving(genItemId());
	    });
	}else{
	    log("error", "rdf have not been loaded")
	}
    }
});
msg_hub.send('GET_OTHER_INSTANCE_REQUEST', '', function(response){
    // alert("Warning", "Found another window")
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
function savePage(itemId, title, content, css, res, callback){
    var finished=0, all=0;
    $.each(res, function(i, item){
	if(item.blob) all++;
    });
    $.each(res, function(i, item){
	if(item.blob){
	    var ext = getMainMimeExt(item.blob.type) || "";
            var reg = new RegExp(item.hex, "g" )
     	    if(item.hex)content = content.replace(reg, item.hex+ext);
	    postBlob(settings.backend_url + "savebinfile", item.blob, item.filename || (item.hex+ext), itemId, function(){
	    	if(++finished == all){
		    content = ['<!Doctype html>', content,].join("\n");
		    var rdf_path = currTree.rdf_path;
		    $.post(settings.backend_url + "savefile", {filename: `${rdf_path}/data/${itemId}/index.html`, content: content}, function(r){
			$.post(settings.backend_url + "savefile", {filename:`${rdf_path}/data/${itemId}/index.css`, content:css, folder:settings.getLastRdfPath() + "data/" + itemId}, function(r){
			    /** update the icon */
			    var icon = "resource://scrapbook/data/" + itemId + "/favicon.ico";
			    $("#"+itemId).removeAttr("disabled");
			    currTree.updateItemIcon($("#"+itemId), icon);
			    /** save xml file when all files uploaded */
			    saveRdf();
			    showNotification({message: `Capture content of "${title}" done`, title: "Info"});
			    callback && callback();
			});
		    });
		}
	    }, function(){
	    	// error
	    });
	}
    });
}
document.addEventListener('contextmenu', function(event){
    if($(".dlg-cover:visible").length)
	event.preventDefault()
    return false;
});
browser.windows.getCurrent({populate: true}).then((windowInfo) => {
    windowId = windowInfo.id;
});
console.log("==> main.js loaded");
