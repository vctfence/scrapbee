var Dialog = class{
    constructor(title='', content='') {
        this.el =  document.createElement("div");
        this.el.className = "scrapbee-dlg-container";
        this.el.innerHTML = `
  <div class="scrapbee-dlg-cover">
    <div class="scrapbee-dlg">
      <div class="scrapbee-dlg-frame">
        <div class="scrapbee-dlg-title">
          ${title}
        </div>
        <div class="scrapbee-dlg-content">
            ${content}
        </div>
      </div>
    </div>
  </div>`;
        document.body.appendChild(this.el);
        /** prevent user in host page selection lose */
        this.el.addEventListener('mousedown', function(e){
            e.preventDefault();
        });
        this.hide();
    }
    get content(){
        return this.findChild(".scrapbee-dlg-content").innerHTML;
    }    
    set content(c){
        this.findChild(".scrapbee-dlg-content").innerHTML = c;
    }
    get title(){
        return this.findChild(".scrapbee-dlg-title").innerHTML;
    }    
    set title(t){
        this.findChild(".scrapbee-dlg-title").innerHTML = t;
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
        this.content = `<div>${content}</div><div class='scrapbee-dlg-yesno-buttons'>
<input type="button" name="" value="No" />
<input type="button" name="" value="Yes" /></div>`;
        this.findChild("input[value=No]").addEventListener("click", function(){
            fn(this.value);
        });
        this.findChild("input[value=Yes]").addEventListener("click", function(){
            fn(this.value);
        });
    }
};
var DialogWaiting = class extends Dialog {
    constructor(title, content, fn) {
        super(title, '');
        this.el.innerHTML = `
  <div class="scrapbee-dlg-cover waiting">
    <div class="scrapbee-dlg">
     <img src="icons/loading.gif" class="waiting-gif"/>
    </div>
  </div>`;
    }
};
var DialogIframe = class extends Dialog {
    constructor(title, src, onload) {
        super(title, '');
        var self = this;
        this.content = `<iframe></iframe>`; 
        this.iframe = this.findChild("iframe");
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
            var dlgcss = browser.extension.getURL("dialog.css");
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
        this.iframe.src = browser.extension.getURL("empty.html");
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
        var cells = '';
        Array.from(arguments).forEach((v) => {
            cells += `<th>${v}</th>`;
        });
        var tr = document.createElement("tr");
        tr.innerHTML = cells;
        this.thead.appendChild(tr);
    }    
    addRow(){
        var self = this;
        var cells = '';
        Array.from(arguments).forEach((v) => {
            cells += `<td>${v}</td>`;
        });
        var tr = document.createElement("tr");
        tr.innerHTML = cells;
        this.tbody.appendChild(tr);
    }
    updateCell(x, y, s){
        this.getCell(x, y).innerHTML = s;
    }
    getCell(x, y){
        return this.tbody.querySelectorAll("tr")[x].querySelectorAll("td")[y];
    }
};
