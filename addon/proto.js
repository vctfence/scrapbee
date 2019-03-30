String.prototype.htmlEncode = function (ignoreAmp) {
    var s = this;
    if (!ignoreAmp) s = s.replace(/&/g, '&amp;')
    return s.replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\"/g, '&quot;')
        .replace(/ /g, '&nbsp;')
        .replace(/\'/g, '&#39;');
}
String.prototype.translate = function () {
    return this.fillData(function (s) {
        try {
            return browser.i18n.getMessage(s) || "";
        } catch (e) {
            return s;
        }
    });
}
String.prototype.htmlDecode = function () {
    return this.replace(/&amp;/g, '&')
        .replace(/&quot;/g, '\"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#39;/g, "'");
}
/*
  html style escape characters
  @chars: chars be escaped
  @slashed: replace chars slashed only
*/
String.prototype.escape = function (chars, slashed) {
    return this.replace(new RegExp((slashed ? "\\\\" : "") + "([" + chars + "])", "g"), function (a, b) {
        return "&#" + b.charCodeAt(0) + ";"
    });
}
/* replace placeholders inside string whith given data */
String.prototype.fillData = function (data) {
    /** value getter */
    function v(s) {
        if (data instanceof Function) {
            return data(s);
        }
        var parts = s.split("."), d = data, r;
        for (let p of parts) {
            if (p) {
                r = d[p];
                d = r
            }
            if (!d) break;
        }
        return r;
    }

    var c = 1;
    /** escape slashed special characters (become normal) */
    var s = this.replace(/\{([\s\S]+)\}/g, function (a, b) {
        return "{" + b.escape("?:!", true) + "}";
    });
    /** replace all placeholder recursively */
    while (c) {
        c = 0;
        s = s.replace(/\{([^\{\}]+?)\}/g, function (match, key) {
            /** match placeholders */
            var m = null, r;
            if (m = key.match(/^([\s\S]+?)\!([\s\S]*?)(?:\:([\s\S]*))?$/)) {
                /** negative test: match [key]![true-part][:false-part] */
                r = !v(m[1]) ? m[2] : (typeof (m[3]) != "undefined" ? m[3] : "");
            } else if (m = key.match(/^([\s\S]+?)\?([\s\S]*?)(?:\:([\s\S]*))?$/)) {
                /** positive test: match [key]?[true-part][:false-part] */
                r = v(m[1]) ? m[2] : (typeof (m[3]) != "undefined" ? m[3] : "");
            } else {
                /** directly */
                var t = v(key);
                r = typeof (t) != "undefined" ? String(t).escape("?:!", false) : "";
            }
            c = 1;
            return r;
        });
    }
    return s;
}
String.prototype.shorten = function storten(l) {
    if (this.length > l) {
        return this.substring(0, l) + "..."
    }
    return this;
}
Date.prototype.format = function (fmt) {
    var o = {
        "M+": this.getMonth() + 1,
        "d+": this.getDate(),
        "h+": this.getHours(),
        "m+": this.getMinutes(),
        "s+": this.getSeconds(),
        "q+": Math.floor((this.getMonth() + 3) / 3),
        "S": this.getMilliseconds()
    };
    if (/(y+)/.test(fmt)) {
        fmt = fmt.replace(RegExp.$1, (this.getFullYear() + "").substr(4 - RegExp.$1.length));
    }
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length == 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
}
String.prototype.isHexColor = function () {
    return this.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}||[0-9a-f]{8})$/i);
}
NodeList.prototype.forEach = Array.prototype.forEach;
NodeList.prototype.iterateAll = function (fn) {
    this.forEach(function (item) {
        fn(item);
        item.childNodes.iterateAll(fn);
    });
}

function ScrapyardElement(el) {
    this.el = el;
}

ScrapyardElement.prototype.processResources = function () {
    this.style = window.getComputedStyle(this.el, false);
    var t = this.el.tagName.toLowerCase().replace(/^\w/, function (m) {
        return m.toUpperCase();
    });
    var fn = "get" + t + "Resources";
    var res = this.getCommonResources();
    var dict = {}, r = [];
    if (this[fn] instanceof Function) {
        var f = this[fn]();
        for (let s of f) {
            res.push(s);
        }
    }
    for (let re of res) {
        if (!dict[re.url]) {
            dict[re.url] = 1;
            r.push(re);
        }
    }
    return r;
}
ScrapyardElement.prototype.getCommonResources = function () {
    var bg = this.style.backgroundImage;
    var m, r = [];
    if (m = bg.match(/^url\(['"]?(.+?)['"]?\)/)) {
        var hex = hex_md5(m[1])
        r.push({tag: this.el.tagName, type: "image", url: m[1], hex: hex})
        this.el.style.backgroundImage = "url('" + hex + "')";
    } else if (m = bg.match(/^data:image\/(.+?);base64,(.+)/)) {
        var hex = hex_md5(bg);
        r.push({tag: this.el.tagName, type: "image", url: bg, hex: hex});
        this.el.style.backgroundImage = hex;
    }
    return r;
}
ScrapyardElement.prototype.getImgResources = function () {
    // console.log("ScrapyardElement.prototype.getImgResources:", this.el.src)
    var r = [];
    if (this.el.getAttribute("src")) {
        var hex = hex_md5(this.el.src);
        r.push({tag: this.el.tagName, type: "image", url: this.el.src, hex: hex});
        this.el.src = hex;
    }
    return r;
}
ScrapyardElement.prototype.getScriptResources = function () {
    this.el.src = ""
    this.el.innerHTML = ""
    return [];
}
ScrapyardElement.prototype.getStyleResources = function () {
    this.el.innerHTML = ""
    return [];
}
ScrapyardElement.prototype.getLinkResources = function () {
    var r = []
    if (this.el.rel == "shortcut icon") {
        r.push({tag: this.el.tagName, type: "image", url: this.el.href, filename: "favicon.ico"})
        this.el.href = "favicon.ico"
    } else {
        this.el.href = ""
    }
    return r;
}
ScrapyardElement.prototype.getIframeResources = function () {
    this.el.src = ""
    this.el.innerHTML = ""
    return [];
}

String.prototype.indexWords = function () {
    return Array.from(new Set(this
        .replace(/<head(?:.|\n)*?<\/head>/gm, '')
        .replace(/<style(?:.|\n)*?<\/style>/gm, '')
        .replace(/<script(?:.|\n)*?<\/script>/gm, '')
        .replace(/<(?:.|\n)*?>/gm, '')
        .replace(/(\s|\n|[^\w])+/g, ' ')
        .split(" ")
        .filter(s => s && s.length > 2)
        .map(s => s.toLocaleUpperCase())
    ));
};
