var Dialog = class{
    constructor(title='', content='') {
        this.el =  document.createElement("div");
        this.el.className = "scrapbee-dlg-container"
        this.el.innerHTML = `
  <div class="scrapbee-dlg-cover">
    <div class="scrapbee-dlg">
      <div class="scrapbee-dlg-title">
        ${title}
      </div>
      <div class="scrapbee-dlg-content">
        <div class="scrapbee-dlg-content-inner">
          ${content}
        </div>
      </div>
    </div>
  </div>`;
        document.body.appendChild(this.el)
        this.hide();
    }
    set content(c){
        this.findChild(".scrapbee-dlg-content-inner").innerHTML = c;
    }
    set title(t){
        this.findChild(".scrapbee-dlg-title").innerHTML = t;
    }
    show(){
        this.el.style.display = "table"
    }
    hide(){
        this.el.style.display = "none"
   }
    remove(){
        this.el.remove()
    }
    findChild(q){
        return this.el.querySelector(q)
    }
    findChildren(q){
        return this.el.querySelectorAll(q)
    }
}
var DialogYesNo = class extends Dialog {
    constructor(title, content, fn) {
        super(title, '');
        this.content = `<div>${content}</div><div class='scrapbee-dlg-yesno-buttons'>
<input type="button" name="" value="No" />
<input type="button" name="" value="Yes" /></div>`
        this.findChild("input[value=No]").addEventListener("click", function(){
            fn(this.value)
        });
        this.findChild("input[value=Yes]").addEventListener("click", function(){
            fn(this.value)
        });
    }
}
var DialogWaiting = class extends Dialog {
    constructor(title, content, fn) {
        super(title, '');
        this.el.innerHTML = `
  <div class="scrapbee-dlg-cover">
    <div class="scrapbee-dlg">
     <img src="icons/loading-big.gif" class="waiting-gif"/>
    </div>
  </div>`;
    }
}
var DialogTable = class extends Dialog {
    constructor(title, content, onclose) {
        super(title, '');
        this.content = `
<div class='scrapbee-dlg-table-outer'><table class='scrapbee-dlg-table'><thead></thead><tbody></tbody></table></div>
<div class='scrapbee-dlg-yesno-buttons'>
<div class='scrapbee-dlg-table-hint'>${content}</div>
<input type="button" name="" value="Close" />
</div>`
        this.findChild("input[value=Close]").addEventListener("click", function(){
            onclose && onclose()
        });
        this.table = this.findChild("table");
        this.thead = this.table.querySelector("thead");
        this.tbody = this.table.querySelector("tbody");
    }
    hideButton(){
        this.findChild("input[value=Close]").style.display = 'none'
    }
    showButton(){
        this.findChild("input[value=Close]").style.display = 'inline-block'
    }
    set content(c){
        this.findChild(".scrapbee-dlg-content").innerHTML = c;
    }
    set hint(s){
        this.findChild(".scrapbee-dlg-table-hint").innerHTML = s;
    }
    addHeader(){
        var self = this;
        var cells = '';
        Array.from(arguments).forEach((v) => {
            cells += `<th>${v}</th>`
        });
        this.thead.innerHTML += `<tr>${cells}</tr>`;
    }    
    addRow(){
        var self = this;
        var cells = '';
        Array.from(arguments).forEach((v) => {
            cells += `<td>${v}</td>`
        });
        this.tbody.innerHTML += `<tr>${cells}</tr>`;
    }
    updateCell(x, y, s){
        this.tbody.querySelectorAll("tr")[x].querySelectorAll("td")[y].innerHTML=s;
    }
    hideRow(x){
        this.tbody.querySelectorAll("tr")[x].style.display = "none";
    }
}
