class SimpleDropdown{
    constructor(button, items, auto_width=true){
        var self = this;
        this.auto_width=auto_width;
        this.button = button;
        this.$menu = $("<div class='simple-menu'></div>").appendTo(document.body);
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
        this.$menu.html("");
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
export {SimpleDropdown}
