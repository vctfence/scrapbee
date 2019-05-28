var settings={};
settings.get=function(k){
    return this[k];
}
settings.set=function(k, v, sync=false){
    if(sync){
        // browser.storage.local.get().then(function(all){
        //     all[k] = v;
        //     browser.storage.local.set(all)
        // });

        if(settings[k] != v){
            var s = {}
            s[k] = v
            browser.storage.local.set(s)
        }
    }
    settings[k] = v;
    if(k == "backend_port"){
	settings["backend_url"] = "http://localhost:" + settings.backend_port + "/";
    }
}
settings.loadFromStorage=async function(){
    await browser.storage.local.get().then(function(all){
        Object.keys(all).forEach(function (key) {
            settings.set(key, all[key]);
        });
    })
}
settings.getRdfPaths=function(){
    var paths = (settings.rdf_paths||"").split("\n");
    paths.pop()
    return paths;
}
settings.getRdfPathNames=function(){
    var names = (settings.rdf_path_names||"").split("\n");
    names.pop()
    return names;
}
settings.pathJoin=function(){
    var arr = Array.from(arguments);
    return arr.join(settings.fs_path_separator);
}
settings.getLastRdfPath=function(){
    return settings.last_rdf.replace(/[^\/\\]*$/, "")
}
/* =================================================== */
browser.storage.onChanged.addListener(function(changes, area){
    var changedItems = Object.keys(changes);
    for (var item of changedItems) {
        settings.set(item, changes[item].newValue);
        settings.onchange && settings.onchange(item, changes[item].newValue);
    }
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
settings.set('bg_color', 'fff', false);
settings.set('font_color', '000', false);
settings.set('separator_color', '999', false);
settings.set('bookmark_color', '050', false);
settings.set('selection_color', '09c', false);
settings.set('font_size', '12', false);
settings.set('line_spacing', '5', false);
settings.set('platform', platform, false);
settings.set('id', browser.runtime.id, false);
settings.set('extension_id', browser.i18n.getMessage("@@extension_id"), false);
settings.set('open_in_current_tab', "off", false);
settings.set('announcement_showed', "", false);
// settings.loadFromStorage();
export {settings}
