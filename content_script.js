/*
  ====================
  content_script.js
  ====================
*/
if(!window.scrapbee_injected){
    ///////////////////////////////
    window.scrapbee_injected = true;
    var currDialog;
    var dlgDownload;
    ///////////////////////////////
    function stringifyArgs(args){
        var ar = Array.from(args); 
        ar.forEach(function(v, i){
            try{
                if(typeof v != "string")
    	            v = JSON.stringify(v);
            }catch(e){
                v = String(v);
            }
            ar[i] = v;
        });
        return ar.join(', ');
    }
    var log = {
        info: function(){
            log.sendLog("info", stringifyArgs(arguments));
        },
        error: function(){
            log.sendLog("error", stringifyArgs(arguments));
        },
        warning: function(){
            log.sendLog("warning", stringifyArgs(arguments));
        },
        debug: function(){
            // log.sendLog("debug", stringifyArgs(arguments))
        },
        clear: function(){
            browser.runtime.sendMessage({type:'CLEAR_LOG'});
        },
        sendLog: function(type, content){
            browser.runtime.sendMessage({type:'LOG', logtype: type, content});
        }
    };
    /* clone parent and all of the ancestors to root, return parent */
    function cloneParents(p){
        var pp, cc;
        // ... -> HTMLHtmlElement(html) -> HTMLDocument -> null
        while(p){
            if(p.nodeType == 1){
                var t = p.cloneNode(false);
                if(!cc) cc = t;
                if(pp)t.appendChild(pp);
                pp = t;
                if(p.tagName.toLowerCase() == "html")
                    break;
            }
            p = p.parentNode;
        }
        return cc;
    }
    var oldLockListener;
    function lockListener(event){
        event.preventDefault();
        event.returnValue = '';
    }
    function lock(){
        if(!oldLockListener){
            window.addEventListener("beforeunload", lockListener);
            oldLockListener = lockListener;
            return true;
        } 
    }
    function unlock(){
        window.removeEventListener("beforeunload", oldLockListener);
        oldLockListener = null;
    }
    function notifyMe(msg) {
        function Next(){
            var notification = new Notification(msg, {tag:"scrapbee-tag"});
            notification.onshow = function () {
                setTimeout(notification.close.bind(notification), 5000);
            };
        }
        if (!("Notification" in window)) {
            //
        } else if (Notification.permission === "granted") {
            Next();
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission(function (permission) {
                if (permission === "granted") {
                    Next();
                }
            });
        }
    }
    function truncate(fullStr, strLen, separator) {
        if (fullStr.length <= strLen) return fullStr;
        separator = separator || '...';
        var sepLen = separator.length,
            charsToShow = strLen - sepLen,
            frontChars = Math.ceil(charsToShow / 2),
            backChars = Math.floor(charsToShow / 2);
        return fullStr.substr(0, frontChars) + 
            separator + 
            fullStr.substr(fullStr.length - backChars);
    };
    /* capture content */
    function getContent(sele){
        return new Promise((resolve, reject) => {
            /** html */
            var content = null;
            var div = document.createElement("div");
            if(sele){
                var selection = window.getSelection();
                if(selection.rangeCount > 0){
                    for(var i=0;i<selection.rangeCount;i++){
                        console.log("append range ", i)
                        var range = selection.getRangeAt(i);
                        parentEl = range.commonAncestorContainer;
                        var p = cloneParents(parentEl);
                        var c = range.cloneContents();
                        if(p){
                            div.appendChild(p.getRootNode());
                            p.appendChild(c);
                        }else{
                            div.appendChild(c);
                        }
                    }
                    var html = div.firstChild;
                    if(html && html.tagName.toLowerCase() == "html"){
                        var heads = document.getElementsByTagName("head");
                        if(heads.length){
                            html.insertBefore(heads[0].cloneNode(true), html.firstChild);
                        }
                    }
                }else{
                    reject("no selection activated");
                }
            }else{
                div.appendChild(document.documentElement.cloneNode(true));
            }
            var __dlg = div.querySelector(".scrapbee-dlg-container");
            if(__dlg) __dlg.remove();
            /** css */
            var css = [];
            for(let sheet of document.styleSheets){
                try{
                    var rule = sheet.rules || sheet.cssRules;
                    for (let r of rule){
                        css.push(r.cssText + "");
                    }
                }catch(e){
                    if(e.name == "SecurityError") {
                        try{
                            var request = new XMLHttpRequest();
                            request.open('GET', sheet.href, false);  // `false` makes the request synchronous
                            request.send(null);
                            if (request.status === 200) {
                                css.push(request.responseText);
                            }
                        }catch(e){
                            log.error(`error process css ${sheet.href}: ${e.message}`);
                        }
                    }
                }
            }
            /** gether resources and inline styles */
            var res = [];
            var distinct = {};
            div.childNodes.iterateAll(function(item){
                if(item.nodeType == 1){
                    var el = new ScrapbeeElement(item)
                    var resources = el.processResources();
                    // el.processInlineStyle();
                    for(let r of resources){
                        if(!distinct[r.url]){
                            distinct[r.url] = 1;
                            res.push(r);
                        }
                    }
                }
            });
            browser.runtime.sendMessage({type: "GET_TAB_FAVICON"}).then((icon_url) => {
                if(icon_url && !res.find(item => {return item.type == "image" && item.filename == "favicon.ico";})){
                    res.push({type:"image", "url": location.origin + "/favicon.ico", filename:"favicon.ico"});
                }
                /*** add main css tag */
                var mc = document.createElement("link");
                mc.rel="stylesheet";
                mc.href="index.css";
                mc.media="screen";
                var head = div.getElementsByTagName("head");
                if(head.length){
                    head[0].appendChild(mc);
                }
                /*** download resources and callback */
                var downloaded = 0;
                Array.from(div.querySelectorAll("*[mark_remove='1']")).forEach(el => el.remove());
                var result = {html: div.innerHTML.trim(), res:res, css: css.join("\n"), title: document.title, have_icon: !!icon_url};
                res.forEach(function(r, i){
                    var style = "cursor:pointer;color:#fff;background:#555;display:inlie-block;border-radius:3px;padding:3px";
                    dlgDownload.addRow("", "<a href='" + r.url + "' target='_blank' style='color:#05f'>" + truncate(r.url, 32) + "</a>", "",
                                       `<font style='color:#cc5500'>downloading.. </font> <span style='${style}'>ignor</span>`);
                    var span = dlgDownload.getCell(i, 3).querySelector("span");
                    span.onclick = function(e){ // ignor this resource (cancel downloading)
                        downloaded ++;
                        dlgDownload.updateCell(i, 3, "<font style='color:#ff0000'>canceled</font>");
                        if(downloaded == res.length){
                            resolve(result);
                        }
                    };
                    downloadFile(r.url, function(b){
                        var ext = getMainMimeExt(b.type) || "";
                        r.saveas = r.filename || (r.hex + ext);
                        if(b)
                            r.blob = b;
                        else{
                            dlgDownload.updateCell(i, 3, "<font style='color:#ff0000'>failed</font>");
                        }
                        downloaded ++;
                        dlgDownload.updateCell(i, 0, b.type);
                        dlgDownload.updateCell(i, 2, r.saveas);
                        if(b.type)
                            dlgDownload.updateCell(i, 3, "<font style='color:#005500'>buffered</font>");
                        if(downloaded == res.length){
                            resolve(result);
                        }
                    });
                });
                dlgDownload.addRow("text/css", "index.css", "index.css", "<font style='color:#005500'>buffered</font>");
                dlgDownload.addRow("text/html", "index.html", "index.html", "<font style='color:#005500'>buffered</font>");
                if(!res.length){
                    resolve(result);
                }
            });
        });
    };
    /* message listener */
    // function getAllCssLoaded(){
    //     var css = [];
    //     for(let sheet of document.styleSheets){
    //         try{
    //             for (let rule of sheet.cssRules){
    //                 css.push(rule.cssText+"");
    //             }
    //         }catch(e){}
    //     }
    //     return css.join("\n");
    // }
    // function getImages(){
    //     var images = [];
    //     for(let image of document.images){
    //         images.push(image.src);
    //     }
    //     return images.join("\n");
    // }
    function startBookmark(rdf, rdfPath, itemId){
        browser.runtime.sendMessage({type: "GET_TAB_FAVICON"}).then((url) => {
            // if(icon.match(/^data:image/i)) // base64
            var filename = `${rdfPath}/data/${itemId}/favicon.ico`;
            browser.runtime.sendMessage({type: "DOWNLOAD_FILE", url, filename, itemId}).then(() => {
                // var icon = "resource://scrapbook/data/" + itemId + "/favicon.ico";
                browser.runtime.sendMessage({type:'UPDATE_FINISHED_NODE', have_icon: !!url, rdf, itemId});
                // todo: showNotification({message: `Capture url "${document.title}" done`, title: "Info"});
            });
        });
    }
    function startCapture(saveType, rdf, rdfPath, itemId){
        if(lock()){
            dlgDownload = new DialogDownloadTable('Download', 'Waiting...', function(){
                dlgDownload.hideButton()
                dlgDownload.addHeader("type", "source", "destination", "status");
                dlgDownload.show();            
                dlgDownload.hint = "Gethering resources...";
                getContent(saveType == "SAVE_SELECTION").then(data => {
                    dlgDownload.hint = "Saving data...";
                    saveData(data, rdfPath, itemId).then(() => {
                        dlgDownload.showButton();
                        dlgDownload.hint = "All done";
                        // var have_icon = !!(data.res[data.res.length - 1].blob);
                        browser.runtime.sendMessage({type:'UPDATE_FINISHED_NODE', have_icon: data.have_icon, rdf, itemId});
                    });
                });
            }, function(r){
                unlock();
                dlgDownload.remove();
            });
            
        }
    }
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        log.debug("content script recv msg:", request.type)
        if(request.type == "SAVE_ADVANCE_REQUEST"){
            if(oldLockListener)
                reject(Error("a task already exists on this page"));
            if(lock()){   
                return new Promise((resolve, reject) => {
                    var url =  browser.extension.getURL("advcap.html");
                    var w = new DialogIframe("{CAPTURE}".translate(), url, function(){
                        browser.runtime.sendMessage({type:'TAB_INNER_CALL',
                                                     dest: "CAPTURER_DLG",
                                                     action: "INIT_FORM",
                                                     title: document.title,
                                                     url: location.href}).then(function(){});
                        resolve();

                    });
                    currDialog = w;
                    w.show();
                });
            }
        }else if(request.type == 'SAVE_PAGE_REQUEST' || request.type == 'SAVE_SELECTION_REQUEST'){
            if(oldLockListener)
                reject(Error("a task already exists on this page"));
            browser.runtime.sendMessage({type: "CREATE_NODE_REQUEST", nodeType: "page", title: document.title, url: location.href}).then((r) => {
                startCapture(request.type.replace(/_REQUEST/, ""), r.rdf, r.rdfPath, r.itemId);
            }).catch(function (error) {
                alert(error)
            });
        }else if(request.type == 'SAVE_URL_REQUEST'){
            browser.runtime.sendMessage({type: "CREATE_NODE_REQUEST", nodeType: "bookmark", title: document.title, url: location.href}).then((r) => {
                startBookmark(r.rdf, r.rdfPath, r.itemId);
            });
        }else if(request.type == "TAB_INNER_CALL" && request.dest == "CONTENT_PAGE"){
            if(request.action == "CANCEL_CAPTURE"){
                currDialog.remove();
                unlock();
            }else if(request.action == "START_CAPTURE"){
                currDialog.remove();
                unlock();
                browser.runtime.sendMessage({type: "IS_SIDEBAR_OPENED"}).then(isSidebarOpened => { // check sidebar of current window
                    if(isSidebarOpened){
                        /** send to all window ??? */
                        var request_new = request;
                        request_new.type = 'CREATE_MIRROR_NODE';
                        request_new.ico = "";
                        browser.runtime.sendMessage(request_new);
                    }
                    if(request.saveType == "SAVE_URL"){
                        startBookmark(request.rdf, request.rdfPath, request.itemId);
                    }else{
                        startCapture(request.saveType, request.rdf, request.rdfPath, request.itemId);
                    }
                });
            }
        }
        return false;
    });
    function saveData(data, rdfPath, scrapId){
        log.debug("save data ...");
        var saved_blobs = 0;
        var {itemId, title, html, css, res} = data;
        // log.info(itemId, title, html, css, res)
        function savePage(resolve, reject){
            if((saved_blobs) == res.length){
                var node = document.doctype;
                var path = `${rdfPath}/data/${scrapId}/index.css`;
                if(node){
                    var doctype = "<!DOCTYPE "
                        + node.name
                        + (node.publicId ? ' PUBLIC "' + node.publicId + '"' : '')
                        + (!node.publicId && node.systemId ? ' SYSTEM' : '') 
                        + (node.systemId ? ' "' + node.systemId + '"' : '')
                        + '>';
                    html = [doctype, html].join("\n");
                }else{
                    html = ['<!Doctype html>', html,].join("\n");
                }
                browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: css, path}).then((response) => {
                    dlgDownload.updateCell(res.length, 3, "<font style='color:#0055ff'>saved</font>");
                    var path = `${rdfPath}/data/${scrapId}/index.html`;
                    browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: html, path}).then((response) => {
                        dlgDownload.updateCell(res.length+1, 3, "<font style='color:#0055ff'>saved</font>");
                        log.debug("capture, all done");
                        resolve();
                    });
                });
            }
        }    
        return new Promise((resolve, reject) => {
            if(res.length){
                res.forEach(function(item, i){
                    if(item.blob){
                        try{
                            var reg = new RegExp(item.hex, "g" );
                            if(item.hex)html = html.replace(reg, item.saveas);
                            item.path = `${rdfPath}/data/${scrapId}/${item.saveas}`;
                            browser.runtime.sendMessage({type: 'SAVE_BLOB_ITEM', item: item}).then((response) => {
                                dlgDownload.updateCell(i, 3, "<font style='color:#0055ff'>saved</font>");
                                saved_blobs++;
                                savePage(resolve, reject);
                            });
                        }catch(e){
                            log.error(e.message);
                        }
                    }else{ // not valid blob
                        saved_blobs++;
                        savePage(resolve, reject);
                    }
                });
            }else{ // no res
                savePage(resolve, reject);
            }
        });
    }
    function isDescendant(parent, child) {
        var node = child;
        while (node != null) {
            if (node == parent) {
                return true;
            }
            node = node.parentNode;
        }
        return false;
    }
    function downloadFile(url, callback){
        try{
            var oReq = new XMLHttpRequest();
            oReq.open("GET", url, true);
            oReq.responseType = "blob";
            oReq.onload = function(oEvent) {
                if(oReq.response){
                    callback(oReq.response);
                }else{
                    callback(false);
                }
            };
            oReq.onerror = function(e){
                callback(false);
            };
            oReq.send();
        }catch(e){
            log.error(`download file error, ${e}`);
            callback(false);
        }
    }
    function loadCss(id, href){
        $(`*[id='${id}']`).remove();
        var head  = document.getElementsByTagName('head')[0];
        var link  = document.createElement('link');
        link.id = id;
        link.rel  = 'stylesheet';
        link.type = 'text/css';
        link.href = href;
        link.media = 'all';
        head.appendChild(link);
    }
    var extension_id = browser.i18n.getMessage("@@extension_id");
    loadCss("content_script", `moz-extension://${extension_id}/content_script.css`);
    loadCss("content_script", `moz-extension://${extension_id}/dialog.css`);
}
console.log("[content_script.js] loaded");
