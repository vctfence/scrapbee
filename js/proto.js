// let HEX_FUN = hex_md5;

var HEX_FUN = function(s){
    return hex_md5(s).substr(0, 15);
}
function NumberRange(a,b){
    this.a=parseFloat(a);
    this.b=parseFloat(b);
};
NumberRange.prototype.random=function(diff){
  var n=diff;
  while(n==diff){
	n=Math.floor(Math.random() * (this.b-this.a+1)) + this.a;
  }
  return n;
};
NumberRange.prototype.forEach=function(fn,step){
    if(!step)step=1;
    if(isNaN(this.a)||isNaN(this.b))return;
    var n=step>0?this.a:-this.a;
    var m=step>0?this.b:-this.b;
    var s=Math.abs(step);
    var counter=0;
    for(var i=n;i<=m;i+=step){
	if(fn.apply(this,[i, counter++])===false)break;
    }
};
String.prototype.htmlEncode = function(ignoreWs, ignoreAmp){
    var s = this;
    if(!ignoreAmp)s=s.replace(/&/g,'&amp;');
    if(!ignoreWs)s = s.replace(/ /g,'&nbsp;');
    return s.replace(/</g,'&lt;')
	.replace(/>/g,'&gt;')
	.replace(/\"/g,'&quot;')
	.replace(/\'/g,'&#39;');
};
String.prototype.htmlDecode=function(){
    return this.replace(/&amp;/g,'&')
	.replace(/&quot;/g,'\"')
	.replace(/&lt;/g,'<')
	.replace(/&gt;/g,'>')
	.replace(/&nbsp;/g,' ')
	.replace(/&#39;/g,"'") ;
};
String.prototype.translate=function(){
    return this.fillData(function(s){
	try{
	    return browser.i18n.getMessage(s) || "";
	}catch(e){
	    return s;
	}
    });
};
String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
}
/*
  html style escape characters
  @chars: chars be escaped
  @slashed: replace chars slashed only
*/
String.prototype.escape = function(chars, slashed) {
    return this.replace(new RegExp((slashed ? "\\\\":"") + "([" + chars + "])", "g"), function(a, b) {
        return "&#" + b.charCodeAt(0) +";";
    });
};
/* replace placeholders inside string with given data */
String.prototype.fillData = function(data) {
    /** value getter */
    function v(s){
	if(data instanceof Function){
	    return data(s);
	}
        var parts = s.split("."), d = data, r;
        for (let p of parts){
            if(p){r = d[p]; d = r;}
            if(!d) break;
        }
        return r;
    }
    var c = 1;
    /** protect escaped brace */
    var s = this.replace(/\\([\{\}])/g, function(a, b) {
        var code = b.charCodeAt(0);
        return `&#${code};`; 
    });
    /** escape slashed special characters (become normal) */
    s = s.replace(/\{([\s\S]+)\}/g, function(a, b) {
        return "{" + b.escape("?:!", true) + "}";
    });
    /** replace all placeholder recursively */
    while(c) {
        c = 0;
        s = s.replace(/\{([^\{\}]+?)\}/g, function(match, key) { /** match placeholders */
            var m = null, r;
            if(m = key.match(/^([\s\S]+?)\!([\s\S]*?)(?:\:([\s\S]*))?$/)) { /** negative test: match [key]![true-part][:false-part] */
                r = !v(m[1]) ? m[2] : (typeof(m[3]) !="undefined" ? m[3] : "");
            } else if(m = key.match(/^([\s\S]+?)\?([\s\S]*?)(?:\:([\s\S]*))?$/)) { /** positive test: match [key]?[true-part][:false-part] */
                r = v(m[1]) ? m[2] : (typeof(m[3]) !="undefined" ? m[3] : "");
            } else { /** directly */
                var t = v(key);
                r = typeof(t) != "undefined" ? String(t).escape("?:!", false) : "";
            }
            c = 1;
            return r;
        });
    }
    return s.replace(/\&\#(\d+)\;/g, function(a, b){
        return String.fromCharCode(parseInt(b));
    });
};
String.prototype.shorten = function storten(l){
    if(this.length > l){
        return this.substring(0,l) + "...";
    }
    return this;
};
Date.prototype.format=function(fmt){
    var o={
	"M+":this.getMonth()+1,
	"d+":this.getDate(), 
	"h+":this.getHours(),
	"m+":this.getMinutes(),
	"s+":this.getSeconds(),
	"q+":Math.floor((this.getMonth()+3)/3),
	"S":this.getMilliseconds()
    };
    if(/(y+)/.test(fmt)){
	fmt=fmt.replace(RegExp.$1,(this.getFullYear()+"").substr(4-RegExp.$1.length));
    }
    for(var k in o){
	if(new RegExp("("+k+")").test(fmt)){
	    fmt=fmt.replace(RegExp.$1,(RegExp.$1.length==1)?(o[k]):(("00"+o[k]).substr((""+o[k]).length)));	
	}
    }
    return fmt;
};
String.prototype.isHexColor=function(){
    return this.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}||[0-9a-f]{8})$/i);
};
NodeList.prototype.forEach = Array.prototype.forEach;
NodeList.prototype.iterateAll = function(fn){
    this.forEach(function(item){
        fn(item);
        item.childNodes.iterateAll(fn);
    });
};
DocumentFragment.prototype.html = function(){
    var self = this;
    return Array.prototype.reduce.call(
        self.childNodes, 
        (result, node) => result + (node.outerHTML || node.nodeValue),
        ''
    );    
}
function ScrapbeeElement(el){
    this.el = el;
    var uniqueId = el.getAttribute("scrapbee_unique_id");
    if(uniqueId){
        this.el.removeAttribute("scrapbee_unique_id");
        this.originEl = document.querySelector(`*[scrapbee_unique_id='${uniqueId}']`);
    }
}
ScrapbeeElement.prototype.getFullUrl=function(url){
    var baseURI = this.el.baseURI.replace(/\/[^\/]+$/, "/");
    return new URL(url, baseURI).href;
}
ScrapbeeElement.prototype.processInlineStyle=function(){
    if(this.el.style.cssText){
        // console.log(this.el.style.cssText)
        this.el.setAttribute("style", this.el.style.cssText);
    }
}
ScrapbeeElement.prototype.processResources=function(){
    if(!this.originEl)
        return [];
    
    var t = this.el.tagName.toLowerCase().replace(/^\w/, function(m){return m.toUpperCase();});
    var fn = "get" + t + "Resources";
    var res = this.getCommonResources();
    var dict = {}, r=[];
    if(this[fn] instanceof Function){
	var f = this[fn]() || [];
	for(let s of f){
	    res.push(s);
	}
    }
    for(let re of res){
	if(!dict[re.url]){
	    dict[re.url] = 1;
	    r.push(re);
	}
    }
    return r;
}
ScrapbeeElement.prototype.getCommonResources=function(){
    try{
        var self = this;
        var style = window.getComputedStyle(this.originEl, false);
        var bg = style.backgroundImage;
        var m, r = [];
        var regexpUrl = /url\(['"]?(.+?)['"]?\)/;
        if(bg.match(regexpUrl)){
            this.el.style.backgroundImage=bg.replace(regexpUrl, function(a, b){
                var url = bg;
                var hex = HEX_FUN(url);
                r.push({tag:self.el.tagName, type:"image", url:b, hex: hex});
                return "url(" + hex + ")";
            });
        }else if(m = bg.match(/data:image\/(.+?);base64,(.+)/)){
	    var hex = HEX_FUN(bg);
	    r.push({tag:this.el.tagName, type:"image", url:bg, hex: hex});
	    this.el.style.backgroundImage = hex;
        }
    }catch(e){
        console.log(`ScrapbeeElement.getCommonResources: ${e}`)
    }
    return r;
}
ScrapbeeElement.prototype.getInputResources=function(){
    this.el.setAttribute("value", this.el.value);
}
ScrapbeeElement.prototype.getTextareaResources=function(){
    this.el.innerHTML = this.el.value;
}
ScrapbeeElement.prototype.getBodyResources=function(){
    var r=[];
    // var style = window.getComputedStyle(this.originEl, false);
    // var bg = style.backgroundImage.replace(/url\(['"]?(.+?)['"]?\)/, function(a, b){
    //     return b;
    // });
    // if(bg && bg != "none"){
    //     try{
    //         var hex = HEX_FUN(bg);
    //         var saveas = hex;
    //         bg.replace(/\.\w+$/,function(a){
    //             saveas = hex + a; // hex + ext
    //         });
    //         r.push({tag:this.el.tagName, type:"body", url:bg, saveas, type: "image"});
    //         this.el.background = saveas;
    //     }catch(e){
    //         console.log(`ScrapbeeElement.getBodyResources: ${e}`)
    //     }
    // }
    return r;
}
ScrapbeeElement.prototype.getImgResources=function(){
    var r=[];
    if(this.el.getAttribute("src")){ // always absolute uri?
	var hex = HEX_FUN(this.el.src);
	r.push({tag:this.el.tagName, type:"image", url:this.el.src, hex});
	this.el.src = hex;
        this.el.srcset = "";
    }
    return r;
};
ScrapbeeElement.prototype.getScriptResources=function(){
    this.el.setAttribute("mark_remove", "1");
    return [];
};
ScrapbeeElement.prototype.getStyleResources=function(){
    this.el.setAttribute("mark_remove", "1");
    return [];
};
ScrapbeeElement.prototype.getLinkResources=function(){
    this.el.setAttribute("mark_remove", "1");
    var r=[];
    if(this.el.rel=="shortcut icon"){
	r.push({tag:this.el.tagName, type:"image", url:this.el.href, saveas:"favicon.ico"});
	this.el.href="favicon.ico";
    }else{
	this.el.href="";
    }
    return r;
};
ScrapbeeElement.prototype.getIframeResources=function(){
    // this.el.setAttribute("mark_remove", "1");
    return [];
};
ScrapbeeElement.prototype.getBaseResources=function(){
    this.el.setAttribute("mark_remove", "1");
    return [];
};
true;
