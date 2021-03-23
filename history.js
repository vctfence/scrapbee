class History{
    constructor(){
        this.data = null;
    }
    load(){
        var self = this;
        return new Promise(resolve=>{
            browser.storage.local.get().then(function(all){
                self.data = all['__history__'] || {};
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
                return true;
            }
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
                return true;
            }
        });
        return (x && t) || null; 
    }
    setItem(path, value){
        var t = this.data;
        var keys = path.split(".");
        var key = keys.pop();
        keys.every((k) => {
            t[k] = t[k] || {};
            t = t[k];
            return true
        });
        t[key] = value;
        this.commit(this.data);
    }
    commit(){
        browser.storage.local.set({'__history__': this.data});
    }
}
export {History}
