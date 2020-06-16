import {settings, global} from "./settings.js";
import {log} from "./message.js";
import {showNotification} from "./utils.js";
import {scriptsAllowed, sendTabContentMessage} from "./utils.js";

/* logging */
String.prototype.htmlEncode=function(ignoreAmp){
    var s=this;
    if(!ignoreAmp)s=s.replace(/&/g,'&amp;');
    return s.replace(/</g,'&lt;')
        .replace(/>/g,'&gt;')
        .replace(/\"/g,'&quot;')
        .replace(/ /g,'&nbsp;')
        .replace(/\'/g,'&#39;');
};
var log_pool = [];
log.sendLog = function(logtype, content){
    if(typeof content != "string"){
        content = String(content);
    }
    var log = {logtype:logtype, content: content.htmlEncode()};
    log_pool.push(log);
    browser.runtime.sendMessage({type:'LOGGING', log});
};
log.clear = function(){
    log_pool = [];
};
/* log version and platform */
var browser_info_status = "";
function loadBrowserInfo(){
    return new Promise((resolve, reject) => {
        if(browser_info_status == "loaded"){
            resolve();
        } else if(browser_info_status == "loading"){
            function wait(){
                setTimeout(function(){
                    if(browser_info_status == "loaded"){
                        resolve();
                    }else{
                        wait();
                    }
                }, 1000);
            }
            wait();
        } else {
            browser_info_status = "loading";
            browser.runtime.getBrowserInfo().then(function(info) {
                var manifest = browser.runtime.getManifest();
                log.info("ScrapBee version = " + manifest.version);
                log.info("browser = " + info.name + " " + info.version);
                var main_version = parseInt(info.version.replace(/\..+/, ""));
                if(info.name != "Firefox" || main_version < 60){
                    var em = "Only Firefox version after 60 is supported";
                    log.error(em);
                    browser_info_status = "error";
                    reject(Error(em))
                }else{
                    log.info("platform = " + navigator.platform);
                    browser_info_status = "loaded";
                    resolve();
                }
            });
        }
    });
}
loadBrowserInfo().then(async () => {
    await settings.loadFromStorage();
    startWebServer(settings.backend_port, 5, "background");
})
/* backend*/
var backend_inst_port;
var web_status;
var backend_version;
function connectBackendInst(){
    if(!backend_inst_port){
        backend_inst_port = browser.runtime.connectNative("scrapbee_backend");
        backend_inst_port.onDisconnect.addListener((p) => {
            if (p.error) {
                log.error(`backend disconnected due to an error: ${p.error.message}`);
            }else{
                log.error(`backend disconnected`);
            }
        });
    }
}
function communicate(command, body, callback){
    connectBackendInst();
    body.command=command;
    backend_inst_port.postMessage(JSON.stringify(body));
    var listener = (response) => {
        callback(response);
        backend_inst_port.onMessage.removeListener(listener);
    };
    backend_inst_port.onMessage.addListener(listener);
}
function startWebServer(port, try_times, debug){
    // if(try_times < 1)
    //     return  Promise.reject(Error("start web server: too many times tried"));
    return new Promise((resolve, reject) => {
        if(web_status == "launched"){
            resolve();
        } else if(try_times < 1){
            reject(Error("start web server: too many times tried"));
        } else if(web_status == "launching"){
            function wait(){
                setTimeout(function(){
                    if(web_status == "launched"){
                        resolve();
                    }else{
                        wait();
                    }
                }, 1000);
            }
            wait();
        } else {
            web_status = "launching";
            loadBrowserInfo().then(() => {
                log.info(`start backend service on port ${port}.`);
                communicate("web-server", {addr: `127.0.0.1:${port}`, port}, function(r){
                    if(r.Serverstate != "ok"){
                        log.error(`failed to start backend service: ${r.Error}`);
                        web_status = "error";
                        return startWebServer(port, try_times - 1, debug);
                    }else{
                        var version = r.Version || 'unknown';
                        backend_version = version;
                        log.info(`backend service started (caller: ${debug}), version = ${version} (wanted >= 1.7.0)`);
                        web_status = "launched";
                        browser.runtime.sendMessage({type: 'BACKEND_SERVICE_STARTED', version});
                        resolve();
                    }
                });
            })
        }
    });
};
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if(request.type == 'START_WEB_SERVER_REQUEST'){
        if(request.force)
            web_status = "";
        return startWebServer(request.port, request.try_times, "sidebar");
    }else if(request.type == 'LOG'){
        log.sendLog(request.logtype, request.content);
    }else if(request.type == 'CLEAR_LOG'){
        __log_clear__();
    }else if(request.type == 'GET_ALL_LOG_REQUEST'){
        return Promise.resolve({logs: log_pool});
    }else if(request.type == 'GET_BACKEND_VERSION'){
        return Promise.resolve(backend_version);
    }else if(request.type == 'SAVE_BLOB_ITEM'){
        var filename = request.item.path;
        var file = request.item.blob;
        if(!file){
            return Promise.reject(Error('empty blob'));
        }else{
            return ajaxFormPost(settings.backend_url + "savebinfile", {filename, file});
        }
    }else if(request.type == 'DOWNLOAD_FILE'){
        var {url, itemId, filename} = request;
        return ajaxFormPost(settings.backend_url + "download", {url, itemId, filename});
    }else if(request.type == 'SAVE_TEXT_FILE'){
        var filename = request.path;
        var content = request.text;
        return new Promise((resolve, reject) => {
            ajaxFormPost(settings.backend_url + "savefile", {filename, content}).then(response => {
                if(request.boardcast){
                    browser.runtime.sendMessage({type: 'FILE_CONTENT_CHANGED', filename, srcToken:request.srcToken}).then((response) => {});
                    browser.tabs.query({}).then(function(tabs){
                        for (let tab of tabs) {
                            browser.tabs.sendMessage(tab.id, {type: 'FILE_CONTENT_CHANGED', filename, srcToken:request.srcToken});
                        }
                    });
                }
                resolve(response);
            }).catch(error => {
                reject(error);
            });
        });
    }else if(request.type == 'FS_MOVE'){
        var src = request.src, dest = request.dest;
        return ajaxFormPost(settings.backend_url + "fs/move", {src, dest});
    }else if(request.type == 'FS_COPY'){
        var src = request.src, dest = request.dest;
        return ajaxFormPost(settings.backend_url + "fs/copy", {src, dest});
    }else if(request.type == 'NOTIFY'){
        return showNotification(request.message, request.title, request.notify_type);
    }else if(request.type == 'TAB_INNER_CALL'){
        return browser.tabs.sendMessage(sender.tab.id, request);
    }else if(request.type == 'IS_SIDEBAR_OPENED'){
        return browser.sidebarAction.isOpen({});
        // browser.tabs.sendMessage(sender.tab.id, request)
    }else if(request.type == 'GET_TAB_FAVICON'){
        return new Promise((resolve, reject) => {
            resolve(sender.tab.favIconUrl);
        });
    }
});
/* build menu */
browser.menus.remove("scrapbee-capture-selection");
browser.menus.remove("scrapbee-capture-page");
browser.menus.remove("scrapbee-capture-url");
browser.menus.create({
    id: "scrapbee-capture-selection",
    title: browser.i18n.getMessage("CaptureSelection"),
    contexts: ["page", "selection", "frame", "editable"],
    documentUrlPatterns: ["http://*/*", "https://*/*", "file://*/*"],
    icons: {"16": "icons/selection.svg", "32": "icons/selection.svg"},
    enabled: true,
    onclick: function(info, tab){
        // withCurrTab(function(t){
        //     browser.windows.get(t.windowId).then((win) => {
        //         console.log(win)
        //     })
        // })
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"});
            }else{
                sendTabContentMessage(tab, {type: 'SAVE_SELECTION_REQUEST'});
                // browser.runtime.sendMessage({type: 'SAVE_PAGE_SELECTION_REQUEST'});
            }
        });
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-page",
    title: browser.i18n.getMessage("CapturePage"),
    contexts: ["page", "selection", "frame", "editable"],
    documentUrlPatterns: ["http://*/*",  "https://*/*", "file://*/*"],
    icons: {"16": "icons/page.svg", "32": "icons/page.svg"},
    onclick: function(info, tab){
        // browser.sidebarAction.open()
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"});
            }else{
                sendTabContentMessage(tab, {type: 'SAVE_PAGE_REQUEST'});
                // browser.runtime.sendMessage({type: 'SAVE_PAGE_REQUEST'});
            }
        });
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-url",
    title: browser.i18n.getMessage("CaptureUrl"),
    contexts: ["page", "selection", "frame", "editable"],
    documentUrlPatterns: ["http://*/*",  "https://*/*", "file://*/*"],
    icons: {"16": "icons/link.svg", "32": "icons/link.svg"},
    onclick: function(info, tab){
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"});
            }else{
                // sendTabContentMessage(tab, {type: 'SAVE_URL_REQUEST'});
                browser.runtime.sendMessage({type: 'SAVE_URL_REQUEST'});
            }
        });
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-advance",
    title: browser.i18n.getMessage("CaptureAdvance"),
    contexts: ["page", "selection", "frame", "editable"],
    documentUrlPatterns: ["http://*/*",  "https://*/*", "file://*/*"],
    icons: {"16": "icons/advance.svg", "32": "icons/advance.svg"},
    onclick: function(info, tab){
        sendTabContentMessage(tab, {type: 'SAVE_ADVANCE_REQUEST'}).then(()=>{
        });
    }
} , function(){});
/* add-on toolbar icon */
browser.browserAction.onClicked.addListener(function(){
    // browser.sidebarAction.open()
});
// browser.browserAction.onClicked.removeListener(listener)
// browser.browserAction.onClicked.hasListener(listener)
/* update menu */
function updateMenu(url) {
    var enabled = !(/localhost.+scrapbee/.test(url)) && (/^http(s?):/.test(url) || /^file:/.test(url));
    browser.menus.update("scrapbee-capture-selection", {enabled: enabled, visible: enabled});
    browser.menus.update("scrapbee-capture-page", {enabled: enabled, visible: enabled});
    browser.menus.update("scrapbee-capture-url", {enabled: enabled, visible: enabled});
    browser.menus.update("scrapbee-capture-advance", {enabled: enabled, visible: enabled});
}
browser.tabs.onUpdated.addListener(function(tabId, changeInfo, tabInfo){
    updateMenu(tabInfo.url);
});
browser.tabs.onActivated.addListener(function(activeInfo){
    browser.tabs.get(activeInfo.tabId).then((tabInfo)=>{
        updateMenu(tabInfo.url);
    });
});
browser.tabs.onCreated.addListener(function(tabInfo){
    updateMenu(tabInfo.url);
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
        };
        request.onreadystatechange=function(){
            if(request.readyState == 4 && request.status == 200){
                resolve(request.responseText);
            }else if(request.status == 500){
                log.error(request.responseText);
                reject(Error(request.responseText));
            }
        };
        request.onerror = function(err) {
            reject(Error(err));
        };
        request.open("POST", url, false);
        setTimeout(function(){
            request.send(formData);
        }, 150);
    });
}
// browser.browserAction.onClicked.addListener(() => {
//     browser.tabs.query({currentWindow: true, active: true}).then(function(tabs){
//         browser.tabs.executeScript(tabs[0].id, { code: 'document.contentType' }, ([ mimeType ]) => {
//             console.log(mimeType);
//         });
//     })
// });
// browser.tabs.query({currentWindow: true, active: true}).then(function(tabs){
//     var saving = browser.tabs.saveAsPDF({});
// });
