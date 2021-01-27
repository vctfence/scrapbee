class SimpleDropdown{
    constructor(button, items, auto_width=true){
        var self = this;
        this.auto_width=auto_width;
        this.button = button;
        this.$menu = $("<div class='simple-dropdown'></div>").appendTo(document.body);
        items.forEach(function(v){
            if(v) self.addItem(v.title || v, v.value || v);
        });
        this.bindEvents();
        this.value=null;
    }
    css(prop, value){
        this.$menu(prop, value);
    }
    clear(){
        this.$menu.hide();
        this.$menu.empty();
        this.select(null, null)
    }
    addItem(title, value){
        $(`<div class='simple-menu-item' value='${value}'>${title}</div>`).appendTo(this.$menu);
    }
    select(title, value){
        if(this.value != value)
            this.onchange && this.onchange(title, value)
        this.value = value;
    }
    bindEvents(){
        var self = this;
        function hput(){
            var p = self.button.getBoundingClientRect();
            self.$menu.css({left: Math.min(p.left, document.body.clientWidth - self.$menu.outerWidth() - 1) + "px"});
            if(!self.auto_width)
                self.$menu.css("width", $(self.button).width() + "px")
        }
        $(window).resize(function(){
            hput();
        });
        $(document.body).bind("mousedown", function(e){
            var click_menu = $(e.target).closest(self.$menu).length > 0;
            if($(e.target).closest(self.button).length > 0){
                var p = self.button.getBoundingClientRect();
                self.$menu.css({top:(p.bottom-1)+"px"})
                hput();
                self.$menu.toggle();   
            }else if(click_menu && $(e.target).hasClass("simple-menu-item")){
                self.$menu.hide();
                var title = $(e.target).html();
                var value = $(e.target).attr("value");
                if(self.value != value){
                    self.select(title, value);
                }
            }else if(!click_menu){
                self.$menu.hide();
            }
        });
    }
}
class ContextMenu{
    constructor(items, auto_width=true){
        var self = this;
        this.auto_width=auto_width;
        this.$menu = $(`<div class='simple-menu'></div>`).appendTo(document.body);
        items.forEach(function(v){
            if(v) self.addItem(v.value, v.title, v.icon);
        });
        this.bindEvents();
        this.value=null;
    }
    show(x, y){
        this.$menu.show();
        this.$menu.css({left: x + "px"});
        this.$menu.css({top: y +"px"});
    }
    css(prop, value){
        this.$menu(prop, value);
    }
    clear(){
        this.$menu.hide();
        this.$menu.empty();
        this.select(null, null)
    }
    hideAllItems(){
        this.$menu.find(`.simple-menu-item`).hide();
    }
    showItems(values){
        var self = this;
        values.forEach(function(v){
            self.$menu.find(`.simple-menu-item[value=${v}]`).show();
        })
    }
    hideItem(value){
        this.$menu.find(`.simple-menu-item[value=${value}]`).hide();
    }
    addItem(value, title, icon=""){
        $(`<div class='simple-menu-item' value='${value}'><img src='${icon}'/> ${title}</div>`).appendTo(this.$menu);
    }
    select(title, value){
        this.onselect && this.onselect(title, value)
    }
    bindEvents(){
        var self = this;
        $(document.body).bind("mousedown", function(e){
            var click_menu = $(e.target).closest(self.$menu).length > 0;
            if(click_menu && $(e.target).hasClass("simple-menu-item")){
                var title = $(e.target).html();
                var value = $(e.target).attr("value");
                if(self.value != value){
                    self.select(title, value);
                }
            }
            if(e.button == 0)
                self.$menu.hide();
        });
    }
}
export {SimpleDropdown, ContextMenu}
