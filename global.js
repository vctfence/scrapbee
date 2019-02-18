var settings={};
settings.get=function(k){
    return this[k];
}
settings.set=function(k, v, sync){
    if(sync || (typeof sync == "undefined")){
	localStorage.setItem(k, v)
    }
    settings[k] = v;
    if(k == "backend_port"){
	settings["backend_url"] = "http://localhost:" + settings.backend_port + "/";
    }
}
settings.loadFromStorage=function(){
    Object.keys(localStorage).forEach(function (key) {
        settings.set(key, localStorage.getItem(key));
    });
}
settings.getRdfPaths=function(){
    var paths = (localStorage.getItem('rdf_paths')||"").split("\n");
    paths.pop()
    return paths;
}
settings.getRdfPathNames=function(){
    var names = (localStorage.getItem('rdf_path_names')||"").split("\n");
    names.pop()
    return names;
}
/* =================================================== */
window.addEventListener("storage", function(e){
    settings.set(e.key, e.newValue);
});
/* =================================================== */
var platform = "linux";
if (navigator.platform == "Win64" || navigator.platform == "Win32") {
    platform = "windows";
}else if(/Mac.+/.test(navigator.platform)){
    platform = "mac";
}
// settings.set('debug', true, false);
settings.set('fs_path_separator', platform=='windows'?'\\':'/', false);
settings.set('backend_port', "9900", false);
settings.set('bg_color', '#fff', false);
settings.set('font_color', '#000', false);
settings.set('separator_color', '#999', false);
settings.set('bookmark_color', '#050', false);
settings.set('platform', platform, false);
settings.set('id', browser.runtime.id, false);
settings.set('extension_id', browser.i18n.getMessage("@@extension_id"), false);
settings.set('open_in_current_tab', "off", false);

settings.loadFromStorage();
settings.pathJoin=function(){
    var arr = Array.from(arguments);
    return arr.join(settings.fs_path_separator);
}
settings.getLastRdfPath=function(){
    return settings.last_rdf.replace(/[^\/\\]*$/, "")
}
function log(logtype, content){
    browser.runtime.sendMessage({type:'LOG', logtype:logtype, content: content});
}
var msg_hub = new (function(){
    var id = 0;
    var listeners = {};
    this.send = function(type, content, callback) {
	var session_id = Math.random();
	if(callback)
	    listeners[session_id] = callback;
	browser.runtime.sendMessage({type: type, content: content, session_id: session_id});
    }
    browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
	var session_id = request.session_id;
	if(listeners[session_id]){
	    listeners[session_id](request);
	    delete listeners[session_id];
	}
    });
})();


export {settings, log, msg_hub}
