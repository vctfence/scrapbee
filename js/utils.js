import {log} from "./message.js";
import {Injector} from "./inject.js";

function scriptsAllowed(tabId, frameId = 0) {
    return browser.tabs.executeScript(tabId, {
        frameId: frameId,
        runAt: 'document_start',
        code: 'true;'
    });
}

function showNotification({message, title=''}) {
    try{
        log[title.toLowerCase()](message);
    }catch(e){}
    
    if(CONF.getItem("global.notification.show") != "on")
        return Promise.resolve();
    
    return browser.notifications.create(`sbi-notification-${title}`, {
        type: 'basic',
        title: title,
        message: message,
        iconUrl: '/icons/bee.png'
    });
}

/* generate id for scraps */
function genItemId(proto){
    var r = String(randRange(1,999999)).padStart(6, "0");
    if(proto)
        return proto.substr(0, 14) + r;
    else
        return new Date().format("yyyyMMddhhmmss" + r);
}

function randRange(a, b){
    return Math.floor(Math.random() * (b - a + 1)) + a;
}

/* compare function for sorting */
function comp(a, b){
    return a < b ? -1 : (a > b ? 1 : 0);
}

/* version compare */
function getVersionParts(v){
    var m = String(v).match(/(\d+)\.(\d+)\.(\d+)/);
    if(m){
        return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
    }else{
        return [0, 0, 0];
    }
}

function gtv(a, b){
    a = getVersionParts(a);
    b = getVersionParts(b);
    for(var i=0; i<b.length; i++){
        if(parseInt(a[i]) > parseInt(b[i])){
            return true;
        }else if(parseInt(a[i]) < parseInt(b[i])){
            return false;
        }
    }
    return false;
}

function gtev(a, b){
    a = getVersionParts(a);
    b = getVersionParts(b);
    try{
        for(var i=0; i<b.length; i++){
            if(parseInt(a[i]) < parseInt(b[i])){
                return false;
            }
        }
    }catch(e){
        return false;
    }
    return true;
}

/* Get needed part from url */
function getUrlParams(url){
    var params = {};
    var m = url.match(/\?[^\?\# ]+$/);
    if(m){
        m = m[0].match(/\w+=[^\&\=\?\# ]+/g);
        if(m) {
            m.forEach((s)=>{
                var [key, value] = s.split("=");
                params[key] = decodeURIComponent(value);
            });
        }
    }
    return params;
}

/* Message and injection */
function sendMessageToTabs(msg) {
    browser.tabs.query({
        // currentWindow: true,
        // active: true
    }).then(tabs => {
        for (let tab of tabs) {
            browser.tabs.sendMessage(
                tab.id, msg
            ).then(response => {
     
            });
        }
    }).catch(e => {});
}
function sendTabContentMessage(tab, data, silent=false, frameId=0){    
    return new Promise((resolve, reject) => {
        scriptsAllowed(tab.id).then(function(){
            if(tab.status == "loading"){
                showNotification({message: `Waiting for page loading, please do not make any operations on this page before capturing finished`, title: "Warning"});
            }
            new Injector(tab.id, frameId)
                .executeScripts(
                    "/libs/mime.types.js",
                    "/libs/jquery-3.3.1.js",
                    "/libs/md5.js",
                    "/js/proto.js",
                    "/js/dialog.js",
                    "/js/tree_c.js",
                    "/js/advcap.js",
                    "/js/content_script.js",
                ).then(function(){
                    browser.tabs.sendMessage(tab.id, data, {frameId}).then(function(haveIcon){
                        resolve(haveIcon);
                    }).catch(function(err){
                        reject(err);
                    });
                }).catch(function(err){
                    reject(err);
                });
        }).catch((e) => {
	    let message = "Add-on content script is not allowed on this page";
	    if(!silent)
                showNotification({message, title: "Error"});
	    reject(Error(e));
        });
    });
}

/* refresh tree and keep the status */
function refreshTree(){
    var params = Array.from(arguments);
    var tree = params.shift();
    var fnLoad = params.shift();
    var expended_ids = tree.getExpendedFolderIds();
    var multiCheck = tree.options.checkboxes;
    return new Promise((resolve, reject) => {
        var p = fnLoad.apply(null, params);
        p.then((tree) => {
            expended_ids.forEach((id) => {
                tree.toggleFolder(tree.getItemById(id), true);
                tree.showCheckBoxes(multiCheck);
            });
            resolve();
        });
    });
}

/* http query */
function httpRequest(url){
    return new Promise((resolve, reject)=>{
        var request=new XMLHttpRequest();
        request.onload = function(r) {
            resolve(r.target.response);
        };
        request.onerror = function(err) {
            reject(err);
        };
        request.open("GET", url, false);
        request.setRequestHeader('cache-control', 'no-cache, must-revalidate, post-check=0, pre-check=0');
        request.setRequestHeader('cache-control', 'max-age=0');
        request.setRequestHeader('expires', '0');
        request.setRequestHeader('expires', 'Tue, 01 Jan 1980 1:00:00 GMT');
        request.setRequestHeader('pragma', 'no-cache');
        setTimeout(function(){ // prevent: too much recursion
            request.send();
        }, 300);
    });
}
function ajaxFormPost(url, json){
    return new Promise((resolve, reject) => {
        var formData = new FormData();
        for(var k in json){
            formData.append(k, json[k]);
        }
        var request = new XMLHttpRequest();
        request.onload = function(r) {
        };
        request.onreadystatechange=function(){
            if(this.readyState == 4 && this.status == 200){
                resolve(this.responseText);
            }else if(this.status >= 400){
                reject(Error(`request ${request.status}: ${request.responseText}`));
            }
        };
        request.onerror = function(e) {
            reject(Error(`request error: ${e.message}`));
        };
        request.open("POST", url, false);
        setTimeout(() => {     // prevent: too much recursion
            request.send(formData);
        }, 300);
    });
}

function downloadFile(url){
    return new Promise((resolve, reject)=>{
        try{
            var request = new XMLHttpRequest();
            request.open("GET", url, true);
            request.responseType = "blob";
            // request.onload = function(oEvent) {
            //     if(request.response){
            //         resolve(request.response);
            //     }else{
            //         reject();
            //     }
            // };
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
}

/* create empty rdf file if the file does not exist */
function touchRdf(backendAddress, path, pwd){
    return new Promise((resolve, reject)=>{
        $.post(backendAddress + "isfile/", {path, pwd}, function(r){
            if(r != "yes"){
                var content = `<?xml version="1.0"?>
<RDF:RDF xmlns:NS1="scrapbee@163.com" xmlns:NC="http://home.netscape.com/NC-rdf#" xmlns:RDF="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
<RDF:Seq RDF:about="urn:scrapbook:root"></RDF:Seq>
</RDF:RDF>`;
                browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: content, path}).then((response) => {
                    resolve();
                }).catch((err) => {
                    reject(err);
                });
            }else{
                resolve();
            }
        });
    });
}

/* convert base46 data to blob */
function dataURLtoBlob(dataurl) {
    var arr = dataurl.split(',');
    var mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]),
        n = bstr.length,
        u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {
        type: mime
    });
}

export{gtv,
       gtev,
       showNotification,
       randRange,
       genItemId,
       comp,
       getUrlParams,
       sendTabContentMessage,
       sendMessageToTabs,
       refreshTree,
       httpRequest,
       ajaxFormPost,
       downloadFile,
       dataURLtoBlob,
       touchRdf};
