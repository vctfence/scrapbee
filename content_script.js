/*
  ====================
  content_script.js
  ====================
*/

function log(logtype, content){
    browser.runtime.sendMessage({type:'LOG', logtype:logtype, content: content});
}

/* clone parent and all of the ancestors to root, return parent */
function cloneParents(p){
    var pp, cc;
    // ... -> HTMLHtmlElement(html) -> HTMLDocument -> null
    while(p){
        var t = p.cloneNode(false);
        if(!cc) cc = t;
        if(pp)t.appendChild(pp);
        pp=t;
        if(p.tagName.toLowerCase() == "html")
            break;
        p = p.parentNode;
    }
    return cc;
}
function lockListener(event){
    event.preventDefault();
    event.returnValue = '';
}
function lock(){
    if(!$("#scrapbee-waiting").length){
	var $cover = $("<div id='scrapbee-waiting'></div>").appendTo(document.body)
	$cover.css({"background-image":"url("+browser.extension.getURL("icons/bee-waiting.svg")+")"})
	window.addEventListener("beforeunload", lockListener);
	return true;
    }
}
function unlock(){
    $("#scrapbee-waiting").remove();
    window.removeEventListener("beforeunload", lockListener);
}
function notifyMe(msg) {
    function Next(){
	var notification = new Notification(msg, {tag:"scrapbee-tag"});
	notification.onshow = function () { 
	    setTimeout(notification.close.bind(notification), 5000); 
	}
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
/* capture content */
function getContent(sele, callback){
    /** html */
    var selection = window.getSelection();
    var content = null;
    var div = document.createElement("div");
    if(sele){
        // if(selection.rangeCount > 0)
        var range = window.getSelection().getRangeAt(0);
	parentEl = range.commonAncestorContainer;
	var p = cloneParents(parentEl);
	var c = range.cloneContents();
	if(p){
	    div.appendChild(p.getRootNode());
	    p.appendChild(c);
	}else{
	    div.appendChild(c);
	}
	var html = div.firstChild;
	if(html && html.tagName.toLowerCase() == "html"){
	    var heads = document.getElementsByTagName("head");
	    if(heads.length){
		html.insertBefore(heads[0].cloneNode(true), html.firstChild);
	    }
	}
    }else{
	div.appendChild(document.documentElement.cloneNode(true));
    }
    $(div).find("#scrapbee-waiting").remove();
    /** css */
    var css=[]
    for(var i=0;i<document.styleSheets.length;i++){
        try{
	    var c = document.styleSheets[i]; 
	    var r = c.rules || c.cssRules;
	    for(var j=0;j<r.length;j++){
                css.push(r[j].cssText + "");
	    }
        }catch(e){
	    if(e.name == "SecurityError") {
		try{
		    var request = new XMLHttpRequest();
		    request.open('GET', c.href, false);  // `false` makes the request synchronous
		    request.send(null);
		    if (request.status === 200) {
			css.push(request.responseText);
		    }
		}catch(e){
		    log("error", e); 
		}
	    }
	}
    }
    /** resources */
    var res = [];
    var dict = {}
    res.push({type:"image", "url": location.origin + "/favicon.ico", filename:"favicon.ico"});
    div.childNodes.iterateAll(function(item){
        if(item.nodeType == 1){
    	    var r = new ScrapbeeElement(item).processResources();
    	    for(var i=0;i<r.length;i++){
    		if(!dict[r[i].url]){		    
    		    dict[r[i].url] = 1;
    		    res.push(r[i]);
    		}
    	    }
        }
    });
    /*** add main css tag */
    var mc = document.createElement("link")
    mc.rel="stylesheet";
    mc.href="index.css";
    mc.media="screen";
    var head = div.getElementsByTagName("head");
    if(head.length){
	head[0].appendChild(mc);
    }
    /*** download resources and callback */
    var result = {html: div.innerHTML.trim(), res:res, css: css.join("\n"), title: document.title};
    var downloaded = 0;
    if(res.length){
	res.forEach(function(r, i){
	    downloadFile(r.url, function(b){
		if(b) r.blob = b;
		if(++downloaded == res.length){
		    callback(result)
		}
	    });
	});
    }else{
	callback(result);
    }
};
/* message listener */
function getAllCssLoaded(){
    var css=[]
    for(var i=0;i<document.styleSheets.length;i++){
        try{
            var r = document.styleSheets[i].cssRules;
            for(var j=0;j<r.length;j++){
                css.push(r[j].cssText+"");
            }
        }catch(e){}
    }
    return css.join("\n");
}
function getImages(){
    var images=[]
    for(var i=0;i<document.images.length;i++){
        images.push(document.images[i].src);
    }
    return images.join("\n");
}
function saveContent(itemId, windowId, content){
    var sending = browser.runtime.sendMessage({
        type: 'SAVE_CONTENT',
	content: content,
	itemId: itemId,
	windowId: windowId
    });
    sending.then(function(resp){
	// response
    }, function(err){
	// err
    });  
}
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if(request.type == "GET_PAGE_SELECTION_REQUEST"){
	if(lock()){
    	    getContent(true, function(content){
		saveContent(request.itemId, request.windowId, content)
    	    });
	}
    }else if(request.type == "GET_PAGE_REQUEST"){
	if(lock()){
    	    getContent(false, function(content){
		saveContent(request.itemId, request.windowId, content)
    	    });
	}
    }else if(request.type == "SAVE_CONTENT_FINISHED"){
	// notifyMe("save " + request.title + " finished.");
	unlock();
    } else if(request.type == 'REQUIRE_OPEN_SIDEBAR'){
	alert("Please open ScrapBee in sidebar before the action")
    }
    return false;
});
function buildTools(){
    if(location.href.match(/\http:\/\/localhost\:9900\/.+?edit=1$/)){
	return;
	var sheet = document.createElement('style')
	// all: unset; all: initial; all: none
	// sheet.innerHTML = ".scrapbee input {all: none; } .scrapbee, .scrapbee *{font-size:9px;font-family:''}";
	sheet.innerHTML = " \
.scrapbee{all:unset; *{all:unset}} \
.scrapbee, .scrapbee *{ \
  left:0px; \
  font-family: 'verdana', 'ms song', '宋体', 'Arial', '微软雅黑', 'Helvetica', 'sans-serif'; \
}";
	document.body.appendChild(sheet);
        var div = document.createElement("div");
        div.className = "scrapbee"
        document.body.appendChild(div);
        var img = document.createElement("img");
        img.style.verticalAlign="middle";
        img.style.marginLeft="10px"
        img.style.width = img.style.height = "20px";
        img.src = icon_bee;
        div.appendChild(img);
        div.innerHTML+="ScrapBee&nbsp;&nbsp;";
        div.style.background="#aaa";
        div.style.borderTop="1px solid #999";
        div.style.width="100%";
        div.style.height="50px";
        div.style.position="fixed";
        div.style.verticalAlign="middle";
        div.style.lineHeight="50px";
        div.style.bottom="0";
        div.style.zIndex=999999999999;
        document.body.style.marginBottom="100px";
        document.body.style.paddingLeft="0px";
        div.style.textAlign="left";
        var btn = document.createElement("input");
        btn.type="button";
        btn.value="modify";
        btn.style.lineHeight="20px";
        div.appendChild(btn);
        btn.addEventListener("click", function(){
            alert("me?")
        });
        var btn = document.createElement("input");
        btn.type="button";
        btn.value="X";
        btn.style.lineHeight="20px";
        btn.style.marginLeft="5px";
        div.appendChild(btn);
    }
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
	oReq.onerror=function(e){
	    callback(false);
	}
	oReq.send();
    }catch(e){
	log("error", `download file error, ${e}`)
	callback(false);
    }
}
console.log("[content_script.js] loaded")
