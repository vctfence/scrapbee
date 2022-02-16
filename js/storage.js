import {gtev} from "./utils.js";
import {global} from "./global.js";

class StorageDB{
    constructor(db){
        var self = this;
        this.data = {};
        this.dbName = db;
        browser.storage.onChanged.addListener(function(changes, area){
            var changedItems = Object.keys(changes);
            var backend_changed;
            var ch = {};
            function compire(path, a, b){
                Object.keys(a).forEach((k)=>{
                    if(a[k].constructor == Object){
                        compire((path ?  (path + ".") : "") + k, a[k], b[k] || {});
                    }else if((a[k] || "").toString() != (b[k] || "").toString()){
                        ch[path + "." +  k] = {newValue: a[k], oldValue: b[k]};
                    }
                });
            }               
            for (var item of changedItems) {
                if(item == self.dbName){
                    var oldData = self.data;
                    var newData = changes[item].newValue;
                    self.data = newData;
                    if(self.__ondatachanged)
                        compire("", newData, oldData);
                }
            }
            if(Object.keys(ch).length)
                self.__ondatachanged(ch);
        });
    }
    load(){
        var self = this;
        return new Promise(resolve=>{
            browser.storage.local.get().then(function(all){
                var data = all[self.dbName] || {};
                Object.keys(data).forEach((k) => {
                    self.data[k] = data[k];
                });
                resolve(self);
            });
        });
    }
    rmItem(path){
        var t = this.data;
        var keys = path.split(".");
        var key = keys.pop();
        var x = keys.every((k)=>{
            if(t){
                t = t[k];
            }
            return !(t == null || t == undefined);
        });
        if(x && t){
            delete t[key];
            this.commit();
        }        
    }
    getItem(path){
        var t = this.data;
        var x = path.split(".").every((k)=>{
            if(t){
                t = t[k];
            }
            return !(t == null || t == undefined);
        });
        return (x && t) || null; 
    }
    setItem(path, value, overwrite=true, commit=false){
        var t = this.data;
        var keys = path.split(".");
        var key = keys.pop();
        keys.every((k) => {
            t[k] = t[k] || {};
            t = t[k];
            return true;
        });
        if(overwrite){
            t[key] = value;
        }else{
            t[key] = t[key] || value;
        }
        if(commit)
            this.commit();
    }
    commit(){
        var json = {};
        json[this.dbName] = this.data;
        browser.storage.local.set(json);
    }
}

class History extends StorageDB{
    constructor(){
        super("__history__");
    }
    getJson(){
        var json = {...this.data};
        return json;
    }    
}

class Configuration extends StorageDB{
    constructor(){
        super("__config__");

        var self = this;
        this.__ondatachanged = (changes) => {
            var backend_changed = false;
            Object.keys(changes).forEach((item)=>{
                var value = changes[item].newValue;
                if(item == "backend.pwd"){
                    backend_changed = true;
                }else if(item == "backend.type"){
                    backend_changed = true;
                }else if(item == "backend.port"){
                    backend_changed = backend_changed || self.getItem("backend.type") == "port";
                }else if(item == "backend.address"){
                    backend_changed = backend_changed || self.getItem("backend.type") == "address";
                }else{
                    if(self.onchange) self.onchange(item, value);
                }
            });
            if(backend_changed){
                if(self.onchange) self.onchange("__backend__");
            }
        };
    }
    translateKey(k, byValue=false){
        var map = {'backend_type': "backend.type",
                   'backend_address': 'backend.address',
                   'backend_port': 'backend.port',
                   'backend_pwd': 'backend.pwd',
                   'rdf_paths': 'tree.paths',
                   'rdf_path_names': 'tree.names',
                   'bg_color': 'tree.color.bg',
                   'font_color': 'tree.color.fg',
                   'separator_color': 'tree.color.separator',
                   'bookmark_color': 'tree.color.bookmark',
                   'focused_fg_color': 'tree.color.focused.fg',
                   'focused_bg_color': 'tree.color.focused.bg',
                   'font_size': 'tree.font.size',
                   'font_name': 'tree.font.name',
                   'line_spacing': 'sidebar.line.spacing',
                   'open_in_current_tab': 'sidebar.behavior.open.dest',
                   'sidebar_show_root': 'sidebar.behavior.root.show',
                   'auto_close_saving_dialog': 'capture.behavior.saving.dialog.close',
                   'saving_save_frames': 'capture.behavior.frames.save',
                   'saving_new_pos': 'capture.behavior.item.new.pos',
                   'show_notification': 'global.notification.show'};
        if(byValue){
            return Object.keys(map)[Object.values(map).indexOf(k)];
        }else{
            return map[k];
        }
    }
    load(){
        var self = this;
        var load = super.load;
        return new Promise((resolve, reject) => {
            // restore from storagedb
            load.call(self).then(() => {
                // set default (and load old settings)
                browser.storage.local.get().then(function(all){
                    function set(key, def){
                        var nKey = self.translateKey(key, true);
                        if(nKey)
                            self.setItem(key, all[nKey] || def, false);
                    }
                    set('backend.type', 'port');
                    set('backend.address', 'http://127.0.0.1:9901');
                    set('backend.port', '9000');
                    set('backend.pwd','');
                    set('tree.paths',[]);
                    set('tree.names',[]);
                    set('tree.color.bg', 'fff');
                    set('tree.color.fg', '000');
                    set('tree.color.separator', '999');
                    set('tree.color.bookmark', '050');
                    set('tree.color.focused.fg', 'fff');
                    set('tree.color.focused.bg', '07a');
                    set('tree.font.size', '12');
                    set('tree.font.name', '');
                    set('sidebar.line.spacing', '5');
                    set('sidebar.behavior.open.dest', 'new-tab'); // 'new-tab' / 'curr-tab'
                    set('sidebar.behavior.root.show', 'off');
                    set('capture.behavior.saving.dialog.close', 'manually');
                    set('capture.behavior.frames.save', 'on');
                    set('capture.behavior.item.new.pos', 'bottom');
                    set('global.notification.show', 'on');
                    resolve(self);
                }).catch(e => {reject(e)});
            }).catch(e => {reject(e)});
        });
    }
    loadJson(json){
        var self = this;
        Object.keys(json).forEach(function(key) {
            var nKey = self.translateKey(key) || key;
            self.setItem(nKey, json[key], true);
        });
        this.commit();
    }
    getJson(){
        var json = {...this.data};
        json.__computed = {fileServiceAddress: this.getFileServiceAddress()};
        return json;
    }
    getRdfPaths(){
        var paths = this.getItem("tree.paths");
        if(paths && Array.isArray(paths)){ // paths.constructor == Array
            return paths;
        }else{
            let paths = (paths || "").split("\n");
            paths.pop();
            return paths;
        }
    }
    getRdfNames(){
        var names = this.getItem("tree.names");
        if(names && Array.isArray(names)){ // names.constructor == Array
            return names;
        }else{
            let names = (names || "").split("\n");
            names.pop();
            return names;
        }
    }
    getBackendAddress(){
        var type =  this.getItem("backend.type");
        var port =  this.getItem("backend.port");
        var address =  this.getItem("backend.address");
        if(type == "port"){
            return "http://localhost:" + port + "/";
        }else{
            return address + "/".replace(/\/{2,}$/, "/");
        }
    }
    getFileServiceAddress(){
        var version = GLOBAL.backendVersion;
        var ad = this.getBackendAddress() + "file-service/";
        if(gtev(version, "1.7.3")){
            ad += "pwd/" + (this.getItem("backend.pwd") || "empty") + "/";    
        }
        return ad;
    }
}
export {Configuration, History};
