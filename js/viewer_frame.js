function loadCssInline(id, href){
    $(`*[id='${id}']`).remove();
    $.get(href, null, null, "text").done(function(data, textStatus, jqXHR) {
        var el = document.createElement("style");
        el.textContent = "\n"+data;
        el.id = id;
        var head  = document.querySelector('body');
        head.appendChild(el);
    });
}

function loadCss(id, href){
    $(`*[id='${id}']`).remove();
    var head  = document.querySelector('head');
    var link  = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.type = 'text/css';
    link.href = href;
    link.media = 'all';
    head.appendChild(link);
}

function isDescendant(parent, child) {
    var node = child;
    while (node != null) {
        if (node == parent) {
            return true;
        }
        node = node.parentNode;
    }
    return false;
}

class Editor{
    constructor(){
        var self = this;

        var extension_id = browser.i18n.getMessage("@@extension_id");
        loadCssInline("scrapbee_editing_markers_css", `moz-extension://${extension_id}/css/edit_markers.css`);

        browser.runtime.onMessage.addListener(function (request, sender, sendResponse) {
            if(request.type == "INIT"){
                self.tabId = sender.tab.id;
                self.frameId = request.frameId;
                // console.log(document.readyState)
                return Promise.resolve("ok")
            }else if(request.type == "GET_HTML"){
                var node = document.doctype;
                var dt = "";
                if(node)
                    dt = "<!DOCTYPE "
                    + node.name
                    + (node.publicId ? ' PUBLIC "' + node.publicId + '"' : '')
                    + (!node.publicId && node.systemId ? ' SYSTEM' : '') 
                    + (node.systemId ? ' "' + node.systemId + '"' : '')
                    + ">\n\r";
                return Promise.resolve(dt + document.documentElement.outerHTML)
            }else if(request.type == "SET_HTML"){
                try{
                    self.replaceHTML(request);
                    document.body.contenteditable = true;
                    return Promise.resolve();
                }catch(e){
                    return Promise.reject(e);
                }
            }else if(request.type == "TOGGLE_EDITING"){
                document.designMode = document.designMode == "off" ? "on" : "off";
            }else if(request.type == "TOGGLE_PAGE_CLEAN"){
                self.toggleDomEdit()
            }else if(request.type == "CLEAR_MARK_PEN"){
                if(self.isSelectionOn()){
                    clearMarkPen(request.marker)
                }else{
                    alert("{NO_SELECTION_ACTIVATED}".translate());
                }
            }else if(request.type == "MARK_PEN"){
                if(self.isSelectionOn()){
                    mark(request.marker)
                }else{
                    alert("{NO_SELECTION_ACTIVATED}".translate());
                }
            }else if(request.type == "GET_TITLE"){
                var link = document.querySelector("link[rel*='shortcut icon']");
                return Promise.resolve([document.title, link && link.href]);
            }else if(request.type == "RELOAD"){
                location.reload();
                return Promise.resolve();
            }
        });   
        window.addEventListener("keydown", function(e){
            if(e.key == "Escape"){
                browser.runtime.sendMessage({type: "TAB_CALL", tabId:self.tabId, key:e.key, message: "onkeydown", frameId:0})
            }
        });
        window.addEventListener("mousedown", function(e){
            var dom = document.elementFromPoint(e.pageX - window.scrollX, e.pageY - window.scrollY);
            console.log(dom)
            
            if(e.button == 0) {
                browser.runtime.sendMessage({type: "TAB_CALL", tabId:self.tabId, message: "onmousedown", frameId:0})
                /** remove dom node by cleaner */
                if(self.last && self.editing){
                    e.preventDefault();
                    self.last.parentNode.removeChild(self.last);
                    self.last = null;
                    /** check next hover target after current target removed */
                    setTimeout(function(){
                        var em = new Event('mousemove');
                        em.pageX = e.pageX;
                        em.pageY = e.pageY;
                        window.dispatchEvent(em);
                    }, 100);
                }
            }
        });
        var currMousePos = {};
        window.addEventListener("scroll", function(e){
            var em = new Event('mousemove');
            em.pageX = currMousePos.x + window.scrollX;
            em.pageY = currMousePos.y + window.scrollY;
            window.dispatchEvent(em);
        });
        window.addEventListener("mousemove", function(e){
            currMousePos.x = e.pageX - window.scrollX;
            currMousePos.y = e.pageY - window.scrollY;
            if(self.editing){
                var dom = document.elementFromPoint(e.pageX - window.scrollX, e.pageY - window.scrollY);
                if(dom){
                    if(dom != document.body && $(document.body).closest(dom).length == 0){
                        self.last = dom;
                        var r = dom.getBoundingClientRect();
                        self.$cap.css("pointer-events", "none");
                        self.$cap.css("box-sizing", "border-box");
                        self.$cap.css({border: "2px solid #f00",
                                       position: "fixed",
                                       left: parseInt(r.left) + "px",
                                       top: parseInt(r.top) + "px", // + window.scrollY
                                       width:r.width+"px",
                                       height:r.height+"px",
                                       zIndex: 2147483647});
                        self.$cap.show();
                    }else{
                        self.$cap.hide();
                    }
                }else{
                    self.$cap.hide();
                }
            }
        });
    }
    isSelectionOn(){
        var selection = window.getSelection();
        if(selection && selection.rangeCount > 0){
            return !selection.getRangeAt(0).collapsed; 
        }
        return false;
    }
    toggleDomEdit(){
        this.last = null;
        this.editing = !this.editing;
        if(this.editing)
            this.$cap = $("<div>").appendTo(document.body);
        else
            this.$cap.remove();
        document.body.style.cursor = this.editing ? "crosshair" : ""; 
    }
    replaceHTML(request){
        // <!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
        // <!DOCTYPE html>
        if(document.doctype){
            document.doctype.parentNode.removeChild(document.doctype);
        }
        if(request.docType){
            var newDoctype = document.implementation.createDocumentType(
                request.docType.name, request.docType.publicId, request.docType.systemId
            );
            document.documentElement.parentNode.insertBefore(newDoctype, document.documentElement);
            // document.doctype.parentNode.replaceChild(newDoctype, document.doctype);
        }
        
        // var n = document.createElement("html");
        // n.outerHTML = request.html;
        // document.replaceChild(n, document.documentElement)

        // document.documentElement.outerHTML = request.html;

        for(var k in request.rootAttrs){
            document.documentElement.setAttribute(k, request.rootAttrs[k])
        }

        document.documentElement.innerHTML = request.html;
    }
}

new Editor();
true;
