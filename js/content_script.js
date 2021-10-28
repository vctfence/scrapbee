/*
  ====================
  content_script.js
  ====================
*/
if(!window.scrapbee_injected){
    ///////////////////////////////
    window.scrapbee_injected = true;
    var currDialog;
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
            log.sendLog("debug", stringifyArgs(arguments))
        },
        clear: function(){
            browser.runtime.sendMessage({type:'CLEAR_LOG'});
        },
        sendLog: function(type, content){
            browser.runtime.sendMessage({type:'LOG', logtype: type, content});
        }
    };
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
    function getLeavesIn(node) {
        var nodes = [];
        function getLeaves(node) {
            if (node.nodeType == 3) {
                nodes.push(node);
            } else {
                if(!node.hasChildNodes()){
                    nodes.push(node);
                }
                for (var i = 0, len = node.childNodes.length; i < len; ++i) {
                    getLeaves(node.childNodes[i]);
                }
            }
        }
        getLeaves(node);
        return nodes;
    }
    function cloneSegment(doc, isForSelection){
        return new Promise((resolve, reject) => {
            var content = null;
            var segment = new DocumentFragment();
            if(isForSelection){
                var selection = window.getSelection();
                if(selection.rangeCount == 0){
                    return reject("no selection activated");
                }
                for(var i=0;i<selection.rangeCount;i++){
                    var range = selection.getRangeAt(i);
                    var rangeContent = range.cloneContents();
                    var commonAncestor = range.commonAncestorContainer;
                    var leaves = getLeavesIn(rangeContent);
                    leaves.forEach(thisNode => {
                        if(thisNode.nodeType == 1){
                            var _uid = thisNode.getAttribute("scrapbee_unique_id");
                            var refNode = document.querySelector(`*[scrapbee_unique_id='${_uid}']`);
                        }else{
                            var refNode = thisNode;
                        }
                        for(var c=refNode,pr=null;c;){
                            var pn = c.cloneNode(false);
                            if(c.nodeType == 1){
                                var uid = c.getAttribute("scrapbee_unique_id");
                                var p = segment.querySelector(`*[scrapbee_unique_id='${uid}']`);
                                var exist = !!p;
                                if(!exist && c.tagName == "HTML"){
                                    segment.appendChild(pn);
                                    p = pn;
                                    exist = true;
                                }
                                if(pr){
                                    if(exist) // time to append to segment
                                        p.appendChild(pr);
                                    else  // as parent of previous node chain
                                        pn.appendChild(pr);
                                }
                                if(exist) break;
                            }
                            pr = pn;
                            if(c.parentNode == rangeContent) { // pure text node 
                                c = commonAncestor;
                            }else{
                                c = c.parentNode;
                            }
                        }
                    });
                }
                var html = segment.firstChild;
                if(html && html.tagName.toLowerCase() == "html"){
                    var heads = doc.getElementsByTagName("head");
                    if(heads.length){
                        html.insertBefore(heads[0].cloneNode(true), html.firstChild);
                    }
                }
            }else{
                segment.appendChild(doc.documentElement.cloneNode(true));
            }
            var __dlg = segment.querySelector(".scrapbee-dlg-container");
            if(__dlg) __dlg.remove();
            resolve(segment);
        });
    }

    /* capture content */
    async function gatherContent(isForSelection, page="index", subPath=""){
        var doc = document;
        var conf = await browser.runtime.sendMessage({type:'GET_SETTINGS'});

        function appendResource(resource){

            console.log(page)
            browser.runtime.sendMessage({type:'TAB_INNER_CALL', action: "APPEND_RESOURCE", resource, page});
        }
        
        // injext all frames
        if(conf.capture.behavior.frames.save == "on"){
            await browser.runtime.sendMessage({type: "GET_FRAMES"}).then(async function(ar){
                for(var i=0;i<ar.length;i++){
                    var f = ar[i];
                    doc.querySelectorAll("iframe,frame").forEach((iframe, i) => {
                        if(f.url == iframe.src){
                            iframe.setAttribute("scrapbee_frame_id", f.frameId);
                        }
                    });
                    try{
                        await browser.runtime.sendMessage({type: "INJECT_FRAME", frameId: f.frameId});
                    }catch(e){
                        console.log("invalid url: ", f.url) // about:debugging, about:addons causes an error
                    }
                }
            });
        }
        return new Promise(async (resolve, reject) => {
            /** html */
            var content = null;
            /** set unique id */
            document.querySelectorAll("*").forEach(el => {
                // browser.runtime.sendMessage({type:'TAB_INNER_CALL', action: "PROCESS_NODE"});
                el.setAttribute("scrapbee_unique_id", "el" + new NumberRange(0,999999999).random());
            });
            try{
                var segment = await cloneSegment(doc, isForSelection)
            }catch(e){
                reject(e)
            }

            /** css */
            var css = [];
            function getRuleCss(r){
                var css = [];
                if(r instanceof CSSStyleRule){
                    css.push(r.cssText);
                }else if(r instanceof CSSImportRule){
                    rule = r.styleSheet.cssRules;
                    for (let r of rule){
                        css.push(r.cssText + "");
                    }
                }
                return css.join("\n");
            }
            for(let sheet of doc.styleSheets){
                try{
                    var rule = sheet.rules || sheet.cssRules;
                    for (let r of rule){
                        css.push(getRuleCss(r));
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
            /** gather resources and inline styles */
            var distinct = {};
            var haveIcon = false;
            try{
                segment.childNodes.iterateAll(function(item){
                    // browser.runtime.sendMessage({type:'TAB_INNER_CALL', action: "PROCESS_NODE"});
                    if(item.nodeType == 1){
                        var el = new ScrapbeeElement(item)
                        var resources = el.processResources();
                        el.processInlineStyle();
                        for(let r of resources){
                            if(!distinct[r.url]){
                                distinct[r.url] = 1;
                                r.subPath = subPath;
                                appendResource(r)
                                if(r.isIcon){
                                    haveIcon = true;
                                }
                            }
                        }
                    }
                });
            }catch(e){
                log.error(e)
            }
            if(!haveIcon && page=="index"){
                var url =  await browser.runtime.sendMessage({type: "GET_TAB_FAVICON"});
                if(url){
                    var hex = hex_md5(url).substr(0, 15);
                    appendResource({tag:"link", type:"image", url, isIcon:true, subPath, hex})
                    var mc = doc.createElement("link");
                    mc.rel="shortcut icon";
                    // mc.href=`{FAVICON_ICO}`;
                    mc.media="screen";
                    var head = segment.querySelectorAll("head");
                    if(head.length){
                        head[0].appendChild(mc);
                        haveIcon = true
                    }
                }
            }
            /*** add main css tag */
            var mc = doc.createElement("link");
            mc.rel="stylesheet";
            mc.href=`index.css`;
            mc.media="screen";
            var head = segment.querySelectorAll("head");
            if(head.length){
                head[0].insertBefore(mc, head[0].firstChild)
            }
            /*** remove tags not wanted */
            segment.querySelectorAll("*[mark_remove='1']").forEach(el => el.remove());
            /*** frames */
            if(conf.capture.behavior.frames.save == "on"){
                var frames = segment.querySelectorAll("iframe, frame");
                for(var i=0;i<frames.length;i++){
                    var iframe = frames[i];
                    var frameId = parseInt(iframe.getAttribute("scrapbee_frame_id"));
                    try{
                        var _name = "iframe" + (i + 1);
                        var _res = await browser.runtime.sendMessage({
                            type: "CALL_FRAME",
                            action: "GATHER_CONTENT",
                            subPath: subPath + _name + "/",
                            page: _name,
                            saveType: "SAVE_PAGE", // isForSelection ? "SAVE_SELECTION" : "SAVE_PAGE",
                            frameId: frameId
                        });
                        iframe.setAttribute("src", _name + "/index.html");
                    }catch(e){
                        console.log(e)
                    }
                }
            }
            /*** html page and css */
            appendResource({type: "text", mime:"text/css", saveas: `${subPath}index.css`, content: css.join("\n")})
            appendResource({type: "text", mime:"text/html", url: doc.location.href, saveas: `${subPath}index.html`, content: segment.html().trim(), subPath,
                            isLast: page == "index", title: doc.title, haveIcon})
            /** remove unique id */
            document.querySelectorAll("*").forEach(el => {
                el.removeAttribute("scrapbee_unique_id");
            });
            resolve();
        });
    };
    function saveBookmarkIcon(rdf, rdfPath, itemId){
        browser.runtime.sendMessage({type: "GET_TAB_FAVICON"}).then((url) => {
            if(!url){
                Array.prototype.forEach.call(document.querySelectorAll("link"), function(item){
                    if(item.rel && /shortcut/.test(item.rel)){
                        url = item.href;
                    }
                });
            }
            if(url){
                var filename = `${rdfPath}/data/${itemId}/favicon.ico`;
                browser.runtime.sendMessage({type: "DOWNLOAD_FILE", url, filename, itemId}).then(() => {
                    browser.runtime.sendMessage({type:'UPDATE_FINISHED_NODE', haveIcon: true, rdf, itemId});
                });
            }else{
                browser.runtime.sendMessage({type:'UPDATE_FINISHED_NODE', haveIcon: false, rdf, itemId});
            }
        })
    }
    async function startCapture(saveType, rdf, rdfPath, itemId, autoClose=false){
        if(!lock()) return;
        var dlgDownload = new DialogDownloadTable('Download', 'Waiting...', async function(){
            var conf = await browser.runtime.sendMessage({type:'GET_SETTINGS'});
            var res = [];
            var title = ""
            var haveIcon = false
            var mainIconFilename = ""
            var blobfile = {};
            var remain = 0;
            // toplevel page
            autoClose = conf.capture.behavior.saving.dialog.close == "auto" || autoClose;
            dlgDownload.hideButton();
            dlgDownload.addHeader("type", "source", "destination", "status");
            dlgDownload.hint = "Fetch resources...";
            dlgDownload.show();
            function gather(){
                return new Promise(async (resolve, reject) => {
                    try{
                        gatherContent(saveType == "SAVE_SELECTION");
                    }catch(e){
                        browser.runtime.sendMessage({type: 'REMOVE_FAILED_NODE', haveIcon, rdf, itemId});
                        dlgDownload.remove();
                        unlock();
                        reject(e);
                    }
                    var downloaded = 0;
                    var added = 0;
                    var all = "";
                    function inc(n, r){
                        downloaded ++;
                        if(!r.failed)
                            dlgDownload.updateCell(n, 2, r.filename);
                        if(downloaded == res.length && all == "loaded"){
                            browser.runtime.onMessage.removeListener(receive);
                            resolve();
                        }
                    }
                    var nodes = 0
                    function receive(request, sender, sendResponse) {
                        if(request.type == "TAB_INNER_CALL" && request.action == "APPEND_RESOURCE"){
                            var i = added ++;
                            var r = request.resource;
                            res.push(r);
                            if(r.isLast){
                                title = r.title;
                                haveIcon = r.haveIcon;
                                all = "loaded";
                            }
                            var style = "cursor:pointer;color:#fff;background:#555;display:inlie-block;border-radius:3px;padding:3px";
                            var sourceLink = r.url ? "<a href='" + r.url + "' target='_blank' style='color:#05f'>" + truncate(r.url, 32) + "</a>" : "generated";
                            if(r.type == "image"){
                                dlgDownload.addRow("", sourceLink, "", `<font style='color:#005500'>waiting</font>`);
                                dlgDownload.updateCell(i, 3, `<font style='color:#cc5500'>downloading.. </font> <span style='${style}'>ignore</span>`);
                                var span = dlgDownload.getCell(i, 3).querySelector("span");
                                span.onclick = function(e){ // ignore this resource (cancel downloading)
                                    dlgDownload.updateCell(i, 3, "<font style='color:#ff0000'>canceled</font>");
                                    r.failed = 1;
                                    inc(i, r);
                                };
                                // download
                                downloadFile(r.url, function(b){
                                    var ext = getMainMimeExt(b.type) || "";
                                    if(r.isIcon) {
                                        var f = "favicon" + ext;
                                        r.filename = r.subPath + f;
                                        blobfile[r.hex] = f;
                                        if(request.page == 'index'){
                                            mainIconFilename = f;
                                        }
                                    }else{
                                        r.filename = r.subPath + (r.saveas || (r.hex + ext));
                                        blobfile[r.hex] = (r.saveas || (r.hex + ext));
                                    }
                                    if(b){
                                        r.blob = b;
                                        dlgDownload.updateCell(i, 0, b.type);
                                        if(b.type)
                                            dlgDownload.updateCell(i, 3, "<font style='color:#005500'>buffered</font>");
                                        // save
                                        r.path = `${rdfPath}/data/${itemId}/${r.filename}`;
                                        browser.runtime.sendMessage({type: 'SAVE_BLOB_ITEM', item: r}).then((response) => {
                                            dlgDownload.updateCell(i, 3, "<font style='color:#0055ff'>saved</font>");
                                            inc(i, r);
                                        }).catch(e => {
                                            dlgDownload.updateCell(i, 3, "<font style='color:#ff0000'>failed</font>");
                                            log.error(e.message);
                                            r.failed = 1;
                                            inc(i, r);
                                        });
                                    }else{ // download failed
                                        if(r.isIcon)
                                            haveIcon = false;
                                        dlgDownload.updateCell(i, 3, "<font style='color:#ff0000'>failed</font>");
                                        r.failed = 1;
                                        inc(i, r);
                                    }
                                });
                            }else{
                                r.filename = r.saveas
                                dlgDownload.addRow(r.mime, sourceLink, "", "<font style='color:#005500'>waiting</font>");
                                remain ++;
                                inc(i, r)
                            }
                        }
                    };
                    browser.runtime.onMessage.addListener(receive);
                });
            }
            await gather();
            dlgDownload.hint = "Save pages ...";
            res.forEach(function(r, i){
                if(r.type != "image"){
                    var content = r.content;
                    if(r.mime == "text/html"){
                        var node = document.doctype;
                        if(node){
                            var doctype = "<!DOCTYPE "
                                + node.name
                                + (node.publicId ? ' PUBLIC "' + node.publicId + '"' : '')
                                + (!node.publicId && node.systemId ? ' SYSTEM' : '') 
                                + (node.systemId ? ' "' + node.systemId + '"' : '')
                                + '>';
                            content = [doctype, content].join("\n");
                        }else{
                            content = ['<!Doctype html>', content,].join("\n");
                        }
                    }
                    var path = `${rdfPath}/data/${itemId}/${r.saveas}`;
                    for(hex in blobfile){
                        if(hex){
                            var reg = new RegExp(hex, "g" );
                            content = content.replace(reg, blobfile[hex]);
                        }
                    }
                    browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: content, path}).then((response) => {
                        browser.runtime.sendMessage({type:'UPDATE_FINISHED_NODE', haveIcon, iconFilename: mainIconFilename, rdf, itemId});
                        dlgDownload.updateCell(i, 3, "<font style='color:#0055ff'>saved</font>");
                    }).catch(e=>{
                        dlgDownload.updateCell(i, 3, "<font style='color:#ff0000'>failed</font>");
                        log.error(e.message);
                    }).finally(()=>{
                        if(!(--remain)){
                            dlgDownload.hint = "Finished";
                            dlgDownload.showButton();
                            if(autoClose){
                                unlock();
                                dlgDownload.remove();
                            }
                        }
                    });
                }
            });
        }, function(r){ // click ok
            unlock();
            dlgDownload.remove();
        });
    }
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
        // log.debug("content script recv msg:", request.type)
        if(request.type == "SAVE_ADVANCE_REQUEST"){
            if(oldLockListener)
                reject(Error("a task already exists on this page"));
            if(lock()){   
                return new Promise((resolve, reject) => {
                    var url =  browser.extension.getURL("/html/advcap.html");
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
        }else if(request.type == "GATHER_CONTENT") {
            return gatherContent(request.saveType == "SAVE_SELECTION", request.page, request.subPath);
        }else if(request.type == 'SAVE_PAGE_REQUEST' || request.type == 'SAVE_SELECTION_REQUEST'){
            if(oldLockListener)
                reject(Error("a task already exists on this page"));
            browser.runtime.sendMessage({type: "CREATE_NODE_REQUEST", nodeType: "page", title: document.title, url: location.href}).then((r) => {
                startCapture(request.type.replace(/_REQUEST/, ""), r.rdf, r.rdfPath, r.itemId, request.autoClose);
            }).catch(function (error) {
                alert("capture failed: " + error)
            });
        }else if(request.type == 'SAVE_URL_REQUEST_INJECTED'){
            browser.runtime.sendMessage({type: "CREATE_NODE_REQUEST", nodeType: "bookmark", title: document.title, url: location.href}).then((r) => {
                saveBookmarkIcon(r.rdf, r.rdfPath, r.itemId);
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
                        saveBookmarkIcon(request.rdf, request.rdfPath, request.itemId);
                    }else{
                        startCapture(request.saveType, request.rdf, request.rdfPath, request.itemId);
                    }
                });
            }
        }
        return false;
    });
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
    loadCss("content_script", `moz-extension://${extension_id}/css/content_script.css`);
    loadCss("content_script", `moz-extension://${extension_id}/css/dialog.css`);
}
console.log("[content_script.js] loaded");
