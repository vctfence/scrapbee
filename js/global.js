var global = {};
global.load = function(){
    var self = global;
    function __p(name, value){
        self.__defineGetter__(name, function() { return value; });
    }
    return new Promise((resolve, reject) => {
        __p("runtimeId", browser.runtime.id);
        __p("extensionId", browser.i18n.getMessage("@@extension_id"));
        browser.runtime.getPlatformInfo().then((p)=>{
            __p("fsPathSeparator", p.os == 'win' ? '\\' : '/');
            __p("platformOS", p.os);
            __p("platformArch", p.arch);
            browser.runtime.sendMessage({type: 'GET_BACKEND_VERSION'}).then((v)=>{
                __p("backendVersion", v);
                resolve();
            });
        });
    });
}
export {global};
