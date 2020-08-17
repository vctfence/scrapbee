var settings={fields:{}};
settings.get=function(k){
    return this[k];
};
settings.set=function(k, v, commit=false){
    if(commit){
        if(settings[k] != v){
            var s = {};
            s[k] = v;
            browser.storage.local.set(s);
        }
    }
    settings[k] = v;
    settings.fields[k] = v;
    if(k == "backend_port"){
	settings.backend_url = "http://localhost:" + settings.backend_port + "/";
    }
};
settings.loadFromStorage=async function(){
    await browser.storage.local.get().then(function(all){
        Object.keys(all).forEach(function (key) {
            settings.set(key, all[key]);
        });
    });
};
settings.loadJson=function(json){
    Object.keys(json).forEach(function(key) {
        settings.set(key, json[key], true);
    });
};
settings.getJson=async function(){
    // var json;
    // await browser.storage.local.get().then(function(all){
    //     json = all;
    // });
    // return json;
    return settings.fields;
};
settings.getRdfPaths=function(){
    var paths = (settings.rdf_paths||"").split("\n");
    paths.pop();
    return paths;
};
settings.getRdfPathNames=function(){
    var names = (settings.rdf_path_names||"").split("\n");
    names.pop();
    return names;
};
settings.pathJoin=function(){
    var arr = Array.from(arguments);
    return arr.join(settings.fs_path_separator);
};
settings.getLastRdfPath=function(){
    return settings.last_rdf.replace(/[^\/\\]*$/, "");
};
/* =================================================== */
browser.storage.onChanged.addListener(function(changes, area){
    var changedItems = Object.keys(changes);
    for (var item of changedItems) {
        settings.set(item, changes[item].newValue);
        if(settings.onchange)
            settings.onchange(item, changes[item].newValue);
    }
});
/* =================================================== */
settings.set('backend_port', "9900");
settings.set('bg_color', 'fff');
settings.set('font_color', '000');
settings.set('separator_color', '999');
settings.set('bookmark_color', '050');
settings.set('focused_fg_color', 'fff');
settings.set('focused_bg_color', '07a');
settings.set('font_size', '12');
settings.set('font_name', '');
settings.set('line_spacing', '5');

settings.set('open_in_current_tab', "off");
settings.set('lock_editbar', "off");
settings.set('auto_close_saving_dialog', "off");

settings.set('announcement_showed', "");
// settings.loadFromStorage();
/* =================================================== */
var global = {};
var platform = "linux";
if (navigator.platform == "Win64" || navigator.platform == "Win32") {
    platform = "windows";
}else if(/Mac.+/.test(navigator.platform)){
    platform = "mac";
}
global.set=function(k, v){
    global[k] = v;
};
// global.set('debug', true, false);
global.set('fs_path_separator', platform=='windows'?'\\':'/');
global.set('platform', platform);
global.set('id', browser.runtime.id);
global.set('extension_id', browser.i18n.getMessage("@@extension_id"));

try{
    browser.runtime.getPlatformInfo().then((p)=>{
        global.set('platform_os', p.os);
        global.set('platform_arch', p.arch);
    });
}catch(e){}

export {settings, global};
