var Dialog = class{
    constructor(title='', content='') {
        this.el = this.newElement(document.body, "div", {className: "scrapbee-dlg-container"})
        var dlgCover = this.newElement(this.el, "div", {className: "scrapbee-dlg-cover"})
        var dlg = this.newElement(dlgCover, "div", {className: "scrapbee-dlg"})
        var frame = this.newElement(dlg, "div", {className: "scrapbee-dlg-frame"})
        this.titleNode = this.newElement(frame, "div", {className: "scrapbee-dlg-title", textContent: title})
        this.contentNode = this.newElement(frame, "div", {className: "scrapbee-dlg-content", innerHTML: content})
        /** prevent user in host page selection lose */
        this.el.addEventListener('mousedown', function(e){
            e.preventDefault();
        });
        this.hide();
    }
    get content(){
        return this.contentNode.innerHTML;
    }    
    set content(c){
        this.contentNode.innerHTML = c;
    }
    get title(){
        return this.titleNode.textContent;
    }    
    set title(t){
        this.titleNode.textContent = t;
    }
    show(){
        this.el.style.display = "table";
    }
    hide(){
        this.el.style.display = "none";
    }
    remove(){
        this.el.remove();
    }
    newElement(parent, tagName, props={}){
        var el = document.createElement(tagName);
        Object.keys(props).forEach(function(k){
            el[k]= props[k];
        });
        parent.appendChild(el);
        return el;
    }
    findChild(q){
        return this.el.querySelector(q);
    }
    findChildren(q){
        return this.el.querySelectorAll(q);
    }
};
var DialogYesNo = class extends Dialog {
    constructor(title, content, fn) {
        super(title, '');
        this.newElement(this.contentNode, "div", {innerHTML: content})
        var box = this.newElement(this.contentNode, "div", {className: "scrapbee-dlg-yesno-buttons"})
        var btnNo = this.newElement(box, "input", {value: "No"})
        var btnYes = this.newElement(box, "input", {value: "Yes"})
        btnNo.addEventListener("click", function(){
            fn(this.value);
        });
        btnYes.addEventListener("click", function(){
            fn(this.value);
        });
    }
};
var DialogWaiting = class extends Dialog {
    constructor(title, content, fn) {
        super(title, '');
        this.el.innerHTML = "";
        var cover = this.newElement(this.el, "div", {className: "scrapbee-dlg-cover waiting"})
        var dlg = this.newElement(cover, "div", {className: "scrapbee-dlg"})
        this.newElement(dlg, "img", {className: "waiting-gif", src: "/icons/loading.gif"})
    }
};
var DialogProgress = class extends Dialog {
    constructor(title, content, fn) {
        super(title, '');
        this.el.innerHTML = "";
        var cover = this.newElement(this.el, "div", {className: "scrapbee-dlg-cover progress"})
        var dlg = this.newElement(cover, "div", {className: "scrapbee-dlg"})

        this.text = this.newElement(dlg, "div", {className: "text"})
        var bar = this.newElement(dlg, "div", {className: "bar"})
        this.indicator = this.newElement(bar, "div", {className: "indicator"})
    }
    setProgress(progress, text=""){
        this.text.textContent = text;
        this.indicator.style.width = Math.floor(progress * 100) + "%";
    }
};
var DialogIframe = class extends Dialog {
    constructor(title, src, onload) {
        super(title, '');
        this.iframe = this.newElement(this.contentNode, "iframe")
        this.iframe.style.width="100%";
        this.iframe.style.height="100%";
        this.iframe.style.minHeight="0px";
        this.iframe.style.minWidth="0px";
        this.iframe.style.border="0px solid #555";
        this.iframe.src = src;
        this.iframe.onload = function(){
            if(onload)onload();
        };
    }
    get iframeWindow(){
        return this.iframe.contentWindow;
    }
    get bodyInner(){
        return this.iframe.contentWindow.document.body;
    }
    get contentInner(){
        return this.bodyInner.innerHTML;
    }    
    set contentInner(c){
        this.bodyInner.innerHTML = c; 
    }
    findChildInner(q){
        return this.bodyInner.querySelector(q);
    }
    findChildrenInner(q){
        return this.bodyInner.querySelectorAll(q);
    }    
};
var DialogDownloadTable = class extends DialogIframe {
    constructor(title, hint, onready, onclose) {
        super(title, '');
        var self = this;
        this.iframe.onload = function(){
            self.bodyInner.style.margin="0px";
            var dlgcss = browser.extension.getURL("/css/dialog.css");
            self.contentInner = `
<link rel="stylesheet" type="text/css" href="${dlgcss}" media="screen"/>
<div class='scrapbee-dlg-table-outer'><table class='scrapbee-dlg-table'><thead></thead><tbody></tbody></table></div>
<div class='scrapbee-dlg-yesno-buttons'>
<div class='scrapbee-dlg-table-hint'>${content}</div>
<input type="button" name="" value="Close" class="blue-button"/>
</div>`;
            self.findChildInner("input[value=Close]").addEventListener("click", function(){
                if(onclose)onclose();
            });
            self.table = self.findChildInner("table");
            self.thead = self.table.querySelector("thead");
            self.tbody = self.table.querySelector("tbody");
            self.hint = hint;
            if(onready)onready();
        };
        this.iframe.src = browser.extension.getURL("/html/empty.html");
    }
    hideButton(){
        this.findChildInner("input[value=Close]").style.display = 'none';
    }
    showButton(){
        this.findChildInner("input[value=Close]").style.display = 'inline-block';
    }
    get hint(){
        return this.findChildInner(".scrapbee-dlg-table-hint").innerHTML;
    }
    set hint(s){
        this.findChildInner(".scrapbee-dlg-table-hint").innerHTML = s;
    }
    addHeader(){
        var self = this;
        var tr = document.createElement("tr");
        Array.from(arguments).forEach((v) => {
            self.newElement(tr, "th", {innerHTML:v})
        });
        this.thead.appendChild(tr);
    }    
    addRow(){
        var self = this;
        var tr = document.createElement("tr");
        Array.from(arguments).forEach((v) => {
            self.newElement(tr, "td", {innerHTML:v})
        });
        this.tbody.appendChild(tr);
    }
    updateCell(x, y, s){
        this.getCell(x, y).innerHTML = s;
    }
    getCell(x, y){
        return this.tbody.querySelectorAll("tr")[x].querySelectorAll("td")[y];
    }
};
