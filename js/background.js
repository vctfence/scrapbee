import {log} from "./message.js";
import {showNotification} from "./utils.js";
import {Injector} from "./inject.js";
import {sendTabContentMessage, sendMessageToTabs, ajaxFormPost, gtev, downloadFile} from "./utils.js";
import {Configuration, History} from "./storage.js";
import {global} from "./global.js";

window.CONF = new Configuration();
window.HISTORY = new History();
window.GLOBAL = global;

/* logging */
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
            new (function (){
                var self = this;
                setTimeout(()=>{
                    if(browser_info_status == "loaded"){
                        resolve();
                    }else{
                        self.constructor();
                    }
                }, 1000);
            })();
        } else {
            browser_info_status = "loading";
            browser.runtime.getBrowserInfo().then(function(info) {
                var manifest = browser.runtime.getManifest();
                log.info("version = " + manifest.version);
                log.info("browser = " + info.name + " " + info.version);
                var main_version = parseInt(info.version.replace(/\..+/, ""));
                let compatible = info.name == "Firefox" && main_version >= 57;
                compatible = compatible || (info.name == "Waterfox" && main_version >= 57);
                if(!compatible){
                    var em = "Your browser or version is not supported";
                    log.error(em);
                    browser_info_status = "error";
                    reject(Error(em));
                }else{
                    // log.info("platform = " + navigator.platform);
                    browser.runtime.getPlatformInfo().then((p)=>{
                        var os = p.os.capitalize();
                        log.info(`platform = ${os} ${p.arch}`);
                        browser_info_status = "loaded";
                        resolve();
                    });
                }
            });
        }
    });
}
loadBrowserInfo().then(async () => {
    await CONF.load();
    startWebServer(20, "background");
});
/* backend*/
var backend_inst_port;
var web_status;
var backend_version;
function communicate(command, body, callback){
    return new Promise((resolve, reject)=>{
        if(!backend_inst_port){
            backend_inst_port = browser.runtime.connectNative("scrapbee_backend");
            backend_inst_port.onDisconnect.addListener((p) => {
                if (p.error) {
                    let em = `backend disconnected due to an error: ${p.error.message}`;
                    log.error(em);
                    reject(Error(em));
                }else{
                    let em = `backend disconnected`;
                    log.error(em);
                    reject(Error(em));
                }
            });
        }
        if(backend_inst_port.error){
            reject(backend_inst_port.error);
        }else{
            body.command = command;
            var listener = (response) => {
                resolve(response);
                backend_inst_port.onMessage.removeListener(listener);
            };
            backend_inst_port.onMessage.addListener(listener);
            backend_inst_port.postMessage(JSON.stringify(body));
        }
    });
}
function startWebServer(try_times){
    if(web_status == "failed"){
        return  Promise.reject(Error("connect web server: failed"));
    }
    function showInfo(r){
        var version = r.Version || 'unknown';
        backend_version = version;
        GLOBAL.set("backendVersion", version);
        log.info(`connect web server: connected, version = ${version}`);
        if(!gtev(version, '1.7.3')){
            log.warning(`connect web server: backend >= 1.7.3 wanted for full functions, please install new version.`);
        }
        web_status = "launched";
        browser.runtime.sendMessage({type: 'BACKEND_SERVICE_STARTED', version});
    }
    return new Promise((resolve, reject) => {
        var port = CONF.getItem("backend.port");
        var pwd = CONF.getItem("backend.pwd");
        if(web_status == "launched"){
            resolve();
        }else if(CONF.getItem("backend.type") == "address"){
            var address = CONF.getBackendAddress();
            log.info(`connect web server: address = ${address}`);
            $.get(address + `serverinfo/?pwd=${pwd}`, function(r){
                if(r.Serverstate == "ok"){
                    web_status = "launched";
                    showInfo(r);
                    resolve();
                }else{
                    startWebServer(try_times - 1);
                }
            }).fail(function(e){
                if(e.status > 0){ // old version backend
                    web_status = "launched";
                    showInfo({});
                    resolve();
                }else{
                    var em = "connect web server: failed to connect backend";
                    reject(Error(em));
                }
            });
        } else if(web_status == "launching"){
            new (function (){
                var self = this;
                setTimeout(()=>{
                    if(browser_info_status == "launched"){
                        resolve();
                    }else{
                        self.constructor();
                    }
                }, 1000);
            })();
        } else {
            web_status = "launching";
            loadBrowserInfo().then(() => {
                log.info(`start web server: port = '${port}'. pwd = '${pwd}'`);
                communicate("web-server", {addr: `127.0.0.1:${port}`, port, pwd}).then(function(r){
                    if(r.Serverstate != "ok"){
                        log.error(`failed to start backend service: ${r.Error}`);
                        web_status = "error";
                        if(try_times > 0){
                            return startWebServer(try_times - 1);
                        }else{
                            web_status = "failed";
                            var ms = "connect web server: too many times tried";
                            return reject(Error(ms));
                        }
                    }else{
                        web_status = "launched";
                        showInfo(r);
                        return resolve();
                    }
                }).catch((e) => {
                    log.error(e);
                });
            });
        }
    }).catch((e)=>{
        log.error(e.message);
        web_status = "failed";
    });
};
CONF.onchange=function(key, value){
    if(key == "__backend__"){
        web_status = "";
        CONF.load().then(()=>{
            startWebServer(20);
        });
    }
};
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if(request.type == 'LOG'){
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
            return ajaxFormPost(CONF.getBackendAddress() + "savebinfile", {filename, file, pwd: CONF.getItem("backend.pwd")});
        }
    }else if(request.type == 'DOWNLOAD_FILE'){
        let {url, itemId, filename} = request;
        return ajaxFormPost(CONF.getBackendAddress() + "download", {url, itemId, filename, pwd: CONF.getItem("backend.pwd")});
    }else if(request.type == 'SAVE_TEXT_FILE'){
        if(request.backup){
            return new Promise((resolve, reject)=>{
                backupFile(request.path).finally(()=>{
                    saveTextFile(request).then((response)=>{
                        resolve(response);
                    }).catch(e=>{
                        reject(e);
                    });
                });
            });
        }else{
            return saveTextFile(request);
        }
    }else if(request.type == 'FS_MOVE'){
        let src = request.src, dest = request.dest;
        return ajaxFormPost(CONF.getBackendAddress() + "fs/move", {src, dest, pwd: CONF.getItem("backend.pwd")});
    }else if(request.type == 'FS_COPY'){
        let src = request.src, dest = request.dest;
        return ajaxFormPost(CONF.getBackendAddress() + "fs/copy", {src, dest, pwd: CONF.getItem("backend.pwd")});
    }else if(request.type == 'NOTIFY'){
        return showNotification(request.message, request.title, request.notify_type);
    }else if(request.type == 'CALL_FRAME'){
        request.type = request.action;
        return browser.tabs.sendMessage(sender.tab.id, request, {frameId: request.frameId});
    }else if(request.type == 'GET_FRAMES'){
        var tabId = sender.tab.id;
        return new Promise((resolve, reject) => {
            return browser.webNavigation.getAllFrames({tabId}).then((ar)=>{
                ar.shift();
                resolve(ar);
            }).catch(e => {
                reject(e);
            });
        });
    }else if(request.type == 'INJECT_FRAME'){
        let tabId = sender.tab.id;
        return new Injector(tabId, request.frameId).executeScripts(
            "/libs/mime.types.js",
            "/libs/jquery-3.3.1.js",
            "/libs/md5.js",
            "/js/proto.js",
            "/js/dialog.js",
            "/js/content_script.js"
        );
    }else if(request.type == 'TAB_INNER_CALL'){
        // return browser.tabs.sendMessage(sender.tab.id, request);
        return browser.tabs.sendMessage(sender.tab.id, request, {frameId: request.frameId});
    }else if(request.type == 'GET_TAB_ID'){
        return Promise.resolve(sender.tab.id);
    }else if(request.type == 'IS_SIDEBAR_OPENED'){
        return browser.sidebarAction.isOpen({});
    }else if(request.type == 'GET_TAB_FAVICON'){
        return new Promise((resolve, reject) => {
            resolve(sender.tab.favIconUrl);
        });
    }else if(request.type == 'GET_SETTINGS'){
        return new Promise((resolve, reject) => {
            GLOBAL.load().then(_ => {
                resolve(CONF.getJson());
            });
        });
    }else if(request.type == 'SAVE_HISTORY'){
        return new Promise((resolve, reject) => {
            HISTORY.load().then(_ => {
                var k;
                for(k in request.items){
                    HISTORY.setItem(k, request.items[k]);
                }
                HISTORY.commit();
                resolve();
            });
        });
    }else if(request.type == 'GET_HISTORY'){
        return new Promise((resolve, reject) => {
            HISTORY.load().then(_ => {
                resolve(HISTORY.getJson());
            });
        });
    }else if(request.type == "CAPTURE_TABS"){
        browser.tabs.query({currentWindow: true}).then(function(tabs){
            for(let tab of tabs){
                var url = tab.url;
                var enabled = !(/localhost.+scrapbee/.test(url)) && (/^http(s?):/.test(url) || /^file:/.test(url));
                if(enabled)
                    sendTabContentMessage(tab, {type: 'SAVE_PAGE_REQUEST', autoClose: true}, true);
            }
        });
    }else if(request.type == "BACKUP_FILE"){
        return backupFile(request.path);
    }else if(request.type == "IS_FILE"){
        return new Promise((resolve, reject) => {
            $.post(CONF.getBackendAddress() + "isfile/", {path: file, pwd: CONF.getItem("backend.pwd")}, function(r){
                resolve(r != "no");
            });
        });
    }else if(request.type == "DOWNLOAD_FILE_BLOB"){
        let url = request.url;
        // local files can not be downloaded directly when
        // security.fileuri.strict_origin_policy = true
        var fs = CONF.getFileServiceAddress();
        url = url.replace(/^file\:\/{3}/, fs);
        return new Promise((resolve, reject)=>{
            try{
                var request = new XMLHttpRequest();
                request.open("GET", url, true);
                request.responseType = "blob";
                request.onload = function(oEvent) {};
                request.onreadystatechange=function(){
                    if(this.readyState == 4 && this.status == 200){
                        resolve(this.response);
                    }else if(this.status >= 400){
                        reject(Error(this.responseText));
                    }
                };
                request.onerror = function(e){
                    reject(e);
                };
                request.send();
            }catch(e){
                reject(e);
            }
        });
    }else if(request.type == "WAIT_WEB_SERVER"){
        var times = request.try_times;
        return new Promise((resolve, reject) => {
            function check(){
                times --;
                if(web_status == "launched"){
                    resolve(backend_version);
                }else if(times < 1){
                    reject(Error("max times tried"));
                }else if(web_status == "failed"){
                    reject(Error("backend failed"));
                }else{
                    setTimeout(function(r){check();}, 1000);
                }
            }
            check();
        });
    }
});
function saveTextFile(request){
    var filename = request.path;
    var content = request.text;
    return new Promise((resolve, reject) => {
        ajaxFormPost(CONF.getBackendAddress() + "savefile", {filename, content, pwd: CONF.getItem("backend.pwd")}).then(response => {
            if(request.boardcast){
                var msg = {type: 'FILE_CONTENT_CHANGED', filename, srcToken:request.srcToken};
                browser.runtime.sendMessage(msg).then((response) => {});
                sendMessageToTabs(msg);
            }
            resolve(response);
        }).catch(error => {
            reject(error);
        });
    });
}
function backupFile(src){
    return new Promise((resolve, reject) => {
        try{
            var dest = src.replace(/([\\\/])([^\\\/]+?)(\.\w*)?$/, function(a, b, c, d){
                return b + "backup" + b + c + "_" + (new Date().format("yyyyMMdd")) + (d || "");
            });
        }catch(e){
            log.error(e.message);
        }
        $.post(CONF.getBackendAddress() + "isfile/", {path: dest, pwd: CONF.getItem("backend.pwd")}, function(r){
            if(r == "no"){
                ajaxFormPost(CONF.getBackendAddress() + "fs/copy", {src, dest, pwd: CONF.getItem("backend.pwd")}).then((response) => {
                    if(response == "ok"){
                        log.info(`backup success: ${dest}`);
                        resolve();
                    }else{
                        log.error(`backup failed: ${response}`);
                        reject(Error(response));
                    }
                }).catch((e) => {
                    log.error(`backup failed: ${dest}`);
                    reject(e);
                });
            }else{
                resolve();
            }
        });
    });
}
/* build menu */
browser.menus.remove("scrapbee-capture-selection");
browser.menus.remove("scrapbee-capture-page");
browser.menus.remove("scrapbee-capture-url");
browser.menus.create({
    id: "scrapbee-capture-selection",
    title: browser.i18n.getMessage("CaptureSelection"),
    contexts: ["page", "selection", "frame", "editable", "audio", "video", "link", "image", "password", "tab"],
    documentUrlPatterns: ["http://*/*", "https://*/*", "file://*/*"],
    icons: {"16": "icons/selection.svg", "32": "icons/selection.svg"},
    enabled: true,
    onclick: function(info, tab){
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"});
            }else{
                sendTabContentMessage(tab, {type: 'SAVE_SELECTION_REQUEST'});
            }
        });
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-page",
    title: browser.i18n.getMessage("CapturePage"),
    contexts: ["page", "selection", "frame", "editable", "audio", "video", "link", "image", "password", "tab"],
    documentUrlPatterns: ["http://*/*",  "https://*/*", "file://*/*"],
    icons: {"16": "icons/page.svg", "32": "icons/page.svg"},
    onclick: function(info, tab){
        // browser.sidebarAction.open()
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"});
            }else{
                sendTabContentMessage(tab, {type: 'SAVE_PAGE_REQUEST'});
            }
        });
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-url",
    title: browser.i18n.getMessage("CaptureUrl"),
    contexts: ["page", "selection", "frame", "editable", "audio", "video", "link", "image", "password", "tab"],
    documentUrlPatterns: ["http://*/*",  "https://*/*", "file://*/*"],
    icons: {"16": "icons/link.svg", "32": "icons/link.svg"},
    onclick: function(info, tab){
        browser.sidebarAction.isOpen({}).then(result => {
            if(!result){
                showNotification({message: "Please open ScrapBee in sidebar before the action", title: "Info"});
            }else{
                browser.runtime.sendMessage({type: 'SAVE_URL_REQUEST'}).then((response) => {});
            }
        });
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-advance",
    title: browser.i18n.getMessage("CaptureAdvance"),
    contexts: ["page", "selection", "frame", "editable", "audio", "video", "link", "image", "password", "tab"],    
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
    // var enabled = !(/localhost.+scrapbee/.test(url)) && (/^http(s?):/.test(url) || /^file:/.test(url));
    var enabled = !(new RegExp(browser.i18n.getMessage("@@extension_id")).test(url)) && /^(http|https|file)\:\/\//.test(url);
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
