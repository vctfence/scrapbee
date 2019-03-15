/* logging */
var log_pool = [];
function __log__(logtype, content){
    if(typeof content != "string"){
        try{
    	    content = JSON.stringify(content);
        }catch(e){
            content = content + "";
        }
    }
    var log = {logtype:logtype, content: content}
    log_pool.push(`${logtype}: ${content}`);
    browser.runtime.sendMessage({type:'LOGGING', log});
}

/* log version and platform */
browser.runtime.getBrowserInfo().then(function(info) {
    var manifest = browser.runtime.getManifest();
    __log__("info", "ScrapBee version = " + manifest.version);
    __log__("info", "browser = " + info.name + " " + info.version);
    var main_version = parseInt(info.version.replace(/\..+/, ""));
    if(info.name != "Firefox" || main_version < 60){
	__log__("error", "Only Firefox version after 60 is supported");
    }
    __log__("info", "platform = " + navigator.platform);
});

/* backend*/
var port;
var web_started;
function connectPort(){
    if(!port){
	browser.runtime.onConnect.addListener((p) => {
	    __log__("info", `backend connected`);
	})
	port = browser.runtime.connectNative("scrapbee_backend");
	port.onDisconnect.addListener((p) => {
	    if (p.error) {
		__log__('info', `backend disconnected due to an error: ${p.error.message}`);
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
function startWebServer(port, callback){
    if(web_started){
	callback();
	return;
    }
    __log__("info", `start web server on port ${port}.`);
    communicate("web-server", {"port": port}, function(r){
	if(r.Serverstate != "ok"){
	    __log__("error", r.Error)
	    startWebServer(port, callback);
	}else{
	    __log__("info", "web server started.")
	    web_started = true;
	    callback();
	}
    });
};
browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if(request.type == 'START_WEB_SERVER_REQUEST'){
	if(request.force) {
	    web_started = false;
	}
	startWebServer(request.content.port, function(){
	    browser.runtime.sendMessage({session_id:request.session_id});
	});
    }else if(request.type == 'LOG'){
	__log__(request.logtype, request.content)
    }else if(request.type == 'GET_ALL_LOG_REQUEST'){
	browser.runtime.sendMessage({session_id:request.session_id, logs: log_pool.join("\n")});
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
    contexts: ["selection"],
    documentUrlPatterns: ["http://*/*", "https://*/*"],
    icons: {"16": "icons/selection.svg", "32": "icons/selection.svg"},
    onclick: function(){
	browser.sidebarAction.isOpen({}).then(result => {
	    if(!result){
		withCurrTab(function(tab){
		    browser.tabs.sendMessage(tab.id, {type: 'REQUIRE_OPEN_SIDEBAR'}, null);
		});
	    }else{
		browser.runtime.sendMessage({type: 'SAVE_PAGE_SELECTION_REQUEST'});
	    }
	});
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-page",
    title: browser.i18n.getMessage("CapturePage"),
    contexts: ["page"],
    documentUrlPatterns: ["http://*/*",  "https://*/*"],
    icons: {"16": "icons/page.svg", "32": "icons/page.svg"},
    onclick: function(){
	// browser.sidebarAction.open()
	browser.sidebarAction.isOpen({}).then(result => {
	    if(!result){
		withCurrTab(function(tab){
		    browser.tabs.sendMessage(tab.id, {type: 'REQUIRE_OPEN_SIDEBAR'}, null);
		});
	    }else{
		browser.runtime.sendMessage({type: 'SAVE_PAGE_REQUEST'});
	    }
	});
    }
}, function(){});
browser.menus.create({
    id: "scrapbee-capture-url",
    title: browser.i18n.getMessage("CaptureUrl"),
    contexts: ["page", "selection"],
    documentUrlPatterns: ["http://*/*",  "https://*/*"],
    icons: {"16": "icons/link.svg", "32": "icons/link.svg"},
    onclick: function(info, tab){
	browser.sidebarAction.isOpen({}).then(result => {
	    if(!result){
		withCurrTab(function(tab){
		    browser.tabs.sendMessage(tab.id, {type: 'REQUIRE_OPEN_SIDEBAR'}, null);
		});
	    }else{
		browser.runtime.sendMessage({type: 'SAVE_URL_REQUEST'});
	    }
	});
    }
}, function(){});

/* toolbar icon */
browser.browserAction.onClicked.addListener(function(){
    browser.sidebarAction.open()
});

// browser.browserAction.onClicked.removeListener(listener)
// browser.browserAction.onClicked.hasListener(listener)
