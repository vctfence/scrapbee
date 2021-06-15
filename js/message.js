function stringifyArgs(args){
    var ar = Array.from(args); 
    ar.forEach(function(v, i){
        try{
            if(typeof v != "string")
    	        v = JSON.stringify(v);
        }catch(e){
            v = String(v).replace(/[\r\n]+/g, "<br>");
        }
        ar[i] = v;
    });
    return ar.join(' ')
}

var log = {
    info: function(){
        log.sendLog("info", stringifyArgs(arguments))
    },
    error: function(){
        log.sendLog("error", stringifyArgs(arguments))
    },
    warning: function(){
        log.sendLog("warning", stringifyArgs(arguments))
    },
    debug: function(){
        log.sendLog("debug", stringifyArgs(arguments))
    },
    clear: function(){
        browser.runtime.sendMessage({type:'CLEAR_LOG'});
    },
    sendLog: function(type, content){
        browser.runtime.sendMessage({type:'LOG', logtype: type, content});
    }
}

export {log}
