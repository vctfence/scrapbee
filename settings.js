var settings={};
settings.get=function(k){
    return this[k];
}
settings.set=function(k, v, commit=false){
    if(commit){
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
settings.set('fs_path_separator', platform=='windows'?'\\':'/');
settings.set('backend_port', "9900");
settings.set('bg_color', 'fff');
settings.set('font_color', '000');
settings.set('separator_color', '999');
settings.set('bookmark_color', '050');
settings.set('selection_color_fg', 'fff');
settings.set('selection_color_bg', '07a');
settings.set('font_size', '12');
settings.set('line_spacing', '5');
settings.set('platform', platform);
settings.set('id', browser.runtime.id);
settings.set('extension_id', browser.i18n.getMessage("@@extension_id"));
settings.set('open_in_current_tab', "off");
settings.set('announcement_showed', "");
// settings.loadFromStorage();
export {settings}
