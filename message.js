var log = {
    info: function(content){
        browser.runtime.sendMessage({type:'LOG', logtype: "info", content: content});
    },
    error: function(content){
        browser.runtime.sendMessage({type:'LOG', logtype: "error", content: content});
    },
    warning: function(content){
        browser.runtime.sendMessage({type:'LOG', logtype: "warning", content: content});
    },
    debug: function(content){
        browser.runtime.sendMessage({type:'LOG', logtype: "debug", content: content});
    },
    clear: function(content){
        browser.runtime.sendMessage({type:'CLEAR_LOG'});
    }
}

class MsgHub {
    constructor() {
        // var id = 0;
        var self=this;
        this.listeners = {};
        browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
	    var session_id = request.session_id;
	    if(self.listeners[session_id]){
	        self.listeners[session_id](request);
	        delete self.listeners[session_id];
	    }
        });
    }
    send(type, content, callback) {
	var session_id = Math.random();
	if(callback)
	    this.listeners[session_id] = callback;
	browser.runtime.sendMessage({type: type, content: content, session_id: session_id});
    }
}
