import {settings} from "./settings.js"
import {log} from "./message.js"
import {showNotification} from "./utils.js"

/* logging */
String.prototype.htmlEncode=function(ignoreAmp){
  var s=this;
  if(!ignoreAmp)s=s.replace(/&/g,'&amp;')
    return s.replace(/</g,'&lt;')
	.replace(/>/g,'&gt;')
	.replace(/\"/g,'&quot;')
	.replace(/ /g,'&nbsp;')
	.replace(/\'/g,'&#39;');
}
var log_pool = [];
log.sendLog = function(logtype, content){
    if(typeof content != "string"){
    	content = String(content);
    }
    var log = {logtype:logtype, content: content.htmlEncode()}
    log_pool.push(log);
    browser.runtime.sendMessage({type:'LOGGING', log});
}
log.clear = function(){
    log_pool = [];
}
/* log version and platform */
browser.runtime.getBrowserInfo().then(function(info) {
    var manifest = browser.runtime.getManifest();
    log.info("ScrapBee version = " + manifest.version);
    log.info("browser = " + info.name + " " + info.version);
    var main_version = parseInt(info.version.replace(/\..+/, ""));
    if(info.name != "Firefox" || main_version < 60){
	log.error("Only Firefox version after 60 is supported");
    }
    log.info("platform = " + navigator.platform);
});
/* backend*/
var port;
var web_started;
var backend_version;
function connectPort(){
    if(!port){
	browser.runtime.onConnect.addListener((p) => {
	    log.info(`backend connected`);
	});
	port = browser.runtime.connectNative("scrapbee_backend");
	port.onDisconnect.addListener((p) => {
	    if (p.error) {
		log.error(`backend disconnected due to an error: ${p.error.message}`);
	    }
	});
    }
    return port;
}
function communicate(command, body, callback){
    var port = connectPort();
    body.command=command;
    port.postMessage(JSON.stringify(body));
    var listener = (response) => {
        callback(response);
        port.onMessage.removeListener(listener);
    };
    port.onMessage.addListener(listener);
}
function startWebServer(port){
    return new Promise((resolve, reject) => {
        if(web_started){
	    resolve();
        }else{
            log.info(`start backend service on port ${port}.`);
            communicate("web-server", {"port": port}, function(r){
	        if(r.Serverstate != "ok"){
	            log.error(r.Error)
	            startWebServer(port).then(() => {
                        resolve()
                    });
	        }else{
                    var version = r.Version || 'unknown'
                    backend_version = version;
	            log.info(`backend service started, version = ${version} (wanted = 1.7.0)`)
	            web_started = true;
                    resolve();
	        }
            });
        }
    });
};
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    // log.debug("background script recv msg: " + request.type)
    if(request.type == 'START_WEB_SERVER_REQUEST'){
	if(request.force)
	    web_started = false;
        return startWebServer(request.port);
    }else if(request.type == 'LOG'){
	log.sendLog(request.logtype, request.content)
    }else if(request.type == 'CLEAR_LOG'){
	__log_clear__()        
    }else if(request.type == 'GET_ALL_LOG_REQUEST'){
        return Promise.resolve({logs: log_pool})
    }else if(request.type == 'GET_BACKEND_VERSION'){
        return Promise.resolve(backend_version);        
    }else if(request.type == 'SAVE_BLOB_ITEM'){
        var filename = request.item.path;
        var file = request.item.blob;
        if(!file){
            return Promise.reject(Error('empty blob'));
        }else{
            return ajaxFormPost(settings.backend_url + "savebinfile", {filename, file})
        }
        // return saveBlobItem(request.item)
    }else if(request.type == 'SAVE_TEXT_FILE'){
        var filename = request.path;
        var content = request.text;
        return ajaxFormPost(settings.backend_url + "savefile", {filename, content})
        // return saveTextFile(request.text, request.path)        
    }else if(request.type == 'FS_MOVE'){
        var src = request.src, dest = request.dest;
        return ajaxFormPost(settings.backend_url + "fs/move", {src, dest})
    }else if(request.type == 'FS_COPY'){
        var src = request.src, dest = request.dest;
        return ajaxFormPost(settings.backend_url + "fs/copy", {src, dest})
    }else if(request.type == 'NOTIFY'){
        return showNotification(request.message, request.title, request.notify_type)
    }
});
function withCurrTab(fn){
    browser.tabs.query({currentWindow: true, active: true}).then(function(tabs){
        fn.apply(null, [tabs[0]]);
    });
}
/* build menu */
browser.menus.remove("scrapbee-capture-selection");
browser.menus.remove("scrapbee-capture-page");
browser.menus.remove("scrapbee-capture-url");
browser.menus.create({
    id: "scrapbee-capture-selection",
    title: browser.i18n.getMessage("CaptureSelection"),
    contexts: ["page", "selection", "frame", "editable"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
    icons: {"16": "icons/selection.svg", "32": "icons/selection.svg"},
    enabled: true,
    onclick: function(){
	browser.sidebarAction.isOpen({}).then(result => {
	    if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"})
	    }else{
		browser.runtime.sendMessage({type: 'SAVE_PAGE_SELECTION_REQUEST'});
	    }
	});
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-page",
    title: browser.i18n.getMessage("CapturePage"),
    contexts: ["page", "selection", "frame", "editable"],
    documentUrlPatterns: ["http://*/*",  "https://*/*"],
    icons: {"16": "icons/page.svg", "32": "icons/page.svg"},
    onclick: function(){
	// browser.sidebarAction.open()
	browser.sidebarAction.isOpen({}).then(result => {
	    if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"})
	    }else{
		browser.runtime.sendMessage({type: 'SAVE_PAGE_REQUEST'});
	    }
	});
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-url",
    title: browser.i18n.getMessage("CaptureUrl"),
    contexts: ["page", "selection", "frame", "editable"],
    documentUrlPatterns: ["http://*/*",  "https://*/*"],
    icons: {"16": "icons/link.svg", "32": "icons/link.svg"},
    onclick: function(info, tab){
	browser.sidebarAction.isOpen({}).then(result => {
	    if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"})
	    }else{
		browser.runtime.sendMessage({type: 'SAVE_URL_REQUEST'});
	    }
	});
    }
}, function(){});
/* add-on toolbar icon */
browser.browserAction.onClicked.addListener(function(){
    browser.sidebarAction.open()
});
// browser.browserAction.onClicked.removeListener(listener)
// browser.browserAction.onClicked.hasListener(listener)
/* update menu */
function updateMenu(url) {
    var enabled = !(/localhost.+scrapbee/.test(url)) && (/^http(s?):/.test(url));
    browser.menus.update("scrapbee-capture-selection", {enabled: enabled, visible: enabled});
    browser.menus.update("scrapbee-capture-page", {enabled: enabled, visible: enabled});
    browser.menus.update("scrapbee-capture-url", {enabled: enabled, visible: enabled});
}
browser.tabs.onUpdated.addListener(function(tabId, changeInfo, tabInfo){
    updateMenu(tabInfo.url)
});
browser.tabs.onActivated.addListener(function(activeInfo){
    browser.tabs.get(activeInfo.tabId).then((tabInfo)=>{
        updateMenu(tabInfo.url)
    });
});
browser.tabs.onCreated.addListener(function(tabInfo){
    updateMenu(tabInfo.url)
});
/* http request */
function ajaxFormPost(url, json){
    return new Promise((resolve, reject) => {
        var formData = new FormData();
        for(var k in json){
            formData.append(k, json[k]);
        }
        var request=new XMLHttpRequest();
        request.onload = function(r) {
        }
        request.onreadystatechange=function(){
            if(request.readyState == 4 && request.status == 200){
                resolve(request.responseText);
            }else if(request.status == 500){
                log.error(request.responseText)
                reject(Error(request.responseText))
            }
        }
        request.onerror = function(err) {
            reject(Error(err));
        };
        request.open("POST", url, false);
        request.send(formData);
    });
}
