var platform = "linux";
if (navigator.platform == "Win64" || navigator.platform == "Win32") {
    platform = "windows";
}else if(/Mac.+/.test(navigator.platform)){
    platform = "mac";
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
function loadCssInline(id, href){
    $(`*[id='${id}']`).remove();
    $.get(href, null, null, "text").done(function(data, textStatus, jqXHR) {
        var el = document.createElement("style")
        el.innerHTML = data;
        el.id = id;
        var head  = document.getElementsByTagName('head')[0];
        head.appendChild(el);
    });
}
function loadCss(id, href){
    $(`*[id='${id}']`).remove();
    var head  = document.getElementsByTagName('head')[0];
    var link  = document.createElement('link');
    link.id = id;
    link.rel  = 'stylesheet';
    link.type = 'text/css';
    link.href = href;
    link.media = 'all';
    head.appendChild(link);
}
class EditToolBar{
    constructor(scrap_path){
        var self = this;
        this.$cap = $("<div>").appendTo(document.body);
        this.scrap_path=scrap_path;
        this.buildTools()
        window.addEventListener("mousedown", function(e){
            if(e.button == 0) {
                if(!isDescendant(self.div, e.target) /** out of toolbar */
                   && self.last && self.editing){
                    e.preventDefault();
                    self.last.parentNode.removeChild(self.last);
                    self.last=null;
                    /** check next target */
                    var em = new Event('mousemove');
                    em.pageX = e.pageX;
                    em.pageY = e.pageY;
                    window.dispatchEvent(em);
                }
                /** hide marker-pen menu when click somewhere */
                if(!$(e.target).hasClass("mark-pen-btn")){
                    if($(self.menu).is(":visible")){
                        e.preventDefault();
                        $(self.menu).removeClass("show");
                    }
                }
            }
        });
        window.addEventListener("mousemove", function(e){
            console.log(self.editing)
            if(self.editing){
                var dom = document.elementFromPoint(e.pageX, e.pageY - window.scrollY);
                if(dom && !isDescendant(self.div, dom)){
                    if(dom != document.body && $(document.body).closest(dom).length == 0){
                        self.last = dom;
                        var r = dom.getBoundingClientRect();
                        self.$cap.css("pointer-events", "none");
                        self.$cap.css("box-sizing", "border-box");
                        self.$cap.css({border: "2px solid #f00",
                                       position: "absolute",
                                       left: parseInt(r.left)+"px",
                                       top: parseInt(r.top + window.scrollY)+"px",
                                       width:r.width+"px",
                                       height:r.height+"px",
                                       zIndex: 999});
                        self.$cap.show();
                    }else{
                        // document.body or ancestors
                    }
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
    toggleDomEdit(on){
        var self = this;
        self.last = null;
        self.editing = on;
        self.$cap.hide()
        $(this.div).find("input[type=button]").prop("disabled", on);
        document.body.style.cursor=self.editing?"crosshair":"";
    }
    saveDoc(){
        var self=this;
        var doc = document.documentElement.cloneNode(true)
        $(doc).find(".scrapbee-edit-bar").remove();
        browser.runtime.sendMessage({type: 'SAVE_TEXT_FILE', text: $(doc).html(), path: self.scrap_path+"index.html"}).then((response) => {
            alert("Content saved")
        }).catch((e) => {
            alert(e.message)
        });
    }
    buildTools(){
        var self = this;
        var editing=false;
        var extension_id = browser.i18n.getMessage("@@extension_id");
        /** load editing css */
        // loadCss("scrapbee_editing_css", `moz-extension://${extension_id}/edit.css`)
        loadCssInline("scrapbee_editing_markers_css", `moz-extension://${extension_id}/edit_markers.css`)
        /** toolbar */
        $(".scrapbee-edit-bar").remove();
        var div = document.createElement("div");
        div.className = "scrapbee-edit-bar"
        document.body.appendChild(div);
        this.div=div;
        /** icon */
        var img = document.createElement("img");
        img.className="scrapbee-icon"
        img.src = `moz-extension://${extension_id}/icons/bee.png`;
        div.appendChild(img);
        div.innerHTML+=" ScrapBee&nbsp;&nbsp;";
        /** body */
        document.body.style.marginBottom="100px";
        document.body.style.paddingLeft="0px";
        document.body.style.marginLeft="0px";
        /** save button */
        var btn = document.createElement("input");
        btn.type="button";
        btn.className="yellow-button"
        btn.value=chrome.i18n.getMessage("save");
        div.appendChild(btn);
        btn.addEventListener("click", function(){
            self.saveDoc();
        });
        /** modify dom button */
        var btn = document.createElement("input");
        btn.type="button";
        btn.className="blue-button"
        btn.value=chrome.i18n.getMessage("MODIFY_DOM_ON");
        div.appendChild(btn);
        btn.addEventListener("click", function(){
            editing=!editing;
            self.toggleDomEdit(editing)
            this.value=chrome.i18n.getMessage(editing?"MODIFY_DOM_OFF":"MODIFY_DOM_ON");
            $(this).prop("disabled", false)
        });
        /** mark pen button */
        var btn = document.createElement("input");
        btn.type="button";
        btn.className="blue-button mark-pen-btn"
        btn.value=chrome.i18n.getMessage("MARK_PEN");
        div.appendChild(btn);
        btn.addEventListener("click", function(){
            $(self.menu).toggleClass("show");
            var rect_div = self.div.getBoundingClientRect();
            var rect_btn = this.getBoundingClientRect();
            $(self.menu).css("cssText", "bottom:" + (rect_div.bottom - rect_btn.top) + "px !important; left:" + rect_btn.left + "px !important;");
        });
        /** mark pen menu */
        var $m = $("<div class='scrapbee-menu'>").appendTo(this.div);
        /** marker cleaner */
        var $item = $("<div class='scrapbee-marker'>").appendTo($m).bind("mousedown", function(e){
            e.preventDefault()
            $(self.menu).removeClass("show");
            if(self.isSelectionOn()){
                clearMarkPen();
            }else{
                alert("{NO_SELECTION_ACTIVATED}".translate());
            }
        });
        $(`<div class='scrapbee-menu-item'>Clear Marks</div>`).appendTo($item);
        /** markers */
        for (let child of ["scrapbee-marker-a1", "scrapbee-marker-a2", "scrapbee-marker-a3",
                           "scrapbee-marker-a4", "scrapbee-marker-a5", "scrapbee-marker-a6",
                           "scrapbee-marker-b1", "scrapbee-marker-b2", "scrapbee-marker-b3", "scrapbee-marker-b4"]){
            var $item = $("<div class='scrapbee-marker'>").appendTo($m).bind("mousedown", function(e){
                e.preventDefault()
                $(self.menu).removeClass("show");
                if(self.isSelectionOn()){
                    mark(child);
                }else{
                    alert("{NO_SELECTION_ACTIVATED}".translate());
                }
            });
            $(`<div class='scrapbee-menu-item ${child}'>Example Text</div>`).appendTo($item);
        }
        this.menu = $m[0];
        /** reload button */
        var btn = document.createElement("input");
        btn.type="button";
        btn.className="blue-button"
        btn.value=chrome.i18n.getMessage("Reload");
        div.appendChild(btn);
        btn.addEventListener("click", function(){
            window.location.reload()
        });
    }
}
if(location.href.match(/\http:\/\/localhost\:\d+\/file-service\/(.+\/data\/\d+\/)\?scrapbee_refresh=\d+$/i)){
    var path = RegExp.$1;
    if(platform!="windows"){
        path = `/${path}`
    }
    new EditToolBar(path);
}
