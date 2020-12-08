import {gtev} from "./utils.js";

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
};
settings.getBackendAddress=function(){
    if(settings.backend_type == "port"){
        return "http://localhost:" + settings.backend_port + "/";
    }else{
        return settings.backend_address + "/";
    }
}
settings.getFileServiceAddress=function(){
    var b = settings.getBackendAddress() + "file-service/";;
    if(gtev(settings.backend_version, "1.7.3")){
        b += "pwd/" + (settings.backend_pwd || "empty") + "/";    
    }
    return b;
}
settings.loadFromStorage=function(){
    return new Promise(resolve=>{
        browser.storage.local.get().then(function(all){
            Object.keys(all).forEach(function (key) {
                settings.set(key, all[key]);
            });
            resolve()
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
    var backend_changed;
    for (var item of changedItems) {
        settings.set(item, changes[item].newValue);
        if(item == "backend_pwd"){
            backend_changed = true;
        }else if(item == "backend_type"){
            backend_changed = true;
        }else if(item == "backend_port"){
            backend_changed = backend_changed || settings.backend_type == "port";
        }else if(item == "backend_address"){
            backend_changed = backend_changed || settings.backend_type == "address";
        }else if(settings.onchange)
            settings.onchange(item, changes[item].newValue);
    }
    if(backend_changed){
        var port = settings.backend_port;
        var type = settings.backend_type;
        var address = settings.backend_address;
        if(settings.onchange)settings.onchange("backend", {type, port, address});
    }
});
/* =================================================== */
settings.set('backend_type', "port");
settings.set('backend_address', "http://127.0.0.1:9901");
settings.set('backend_port', "9900");
settings.set('backend_pwd', "");
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
settings.set('sidebar_show_root', "off");
settings.set('lock_editbar', "off");
settings.set('auto_close_saving_dialog', "off");
settings.set('saving_save_frames', "on");
settings.set('saving_new_pos', "bottom");
settings.set('announcement_showed', "");
// settings.loadFromStorage().then(()=>{
//     alert(settings.backend_version)
// })
/* =================================================== */
var global = {};
global.set=function(key, value, boardcast=false) {
    global[key] = value;
};
// global.set('debug', true, false);
global.set('id', browser.runtime.id);
global.set('extension_id', browser.i18n.getMessage("@@extension_id"));
try{
    browser.runtime.getPlatformInfo().then((p)=>{
        global.set('fs_path_separator', p.os == 'win' ? '\\' : '/');
        global.set('platform_os', p.os);
        global.set('platform_arch', p.arch);
    });
}catch(e){}
export {settings, global};
