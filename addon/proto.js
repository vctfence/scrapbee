String.prototype.htmlEncode = function (ignoreAmp, ignoreQuotes) {
    var s = this;
    if (!ignoreAmp) s = s.replace(/&/g, '&amp;')

    if (!ignoreQuotes) {
        s.replace(/\"/g, '&quot;')
         .replace(/\'/g, '&#39;');
    }

    return s.replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
          //.replace(/ /g, '&nbsp;')
        ;
};

String.prototype.htmlDecode = function () {
    return this.replace(/&amp;/g, '&')
        .replace(/&quot;/g, '\"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#39;/g, "'");
};

String.prototype.translate = function () {
    return this.fillData(function (s) {
        try {
            return browser.i18n.getMessage(s) || "";
        } catch (e) {
            return s;
        }
    });
};

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

String.prototype.indexWords = function () {
    try {
        return Array.from(new Set(this
            .substring(this.indexOf("<body>"))
            .replace(/<style(?:.|\n)*<\/style>/gm, '')
            .replace(/<script(?:.|\n)*<\/script>/gm, '')
            .replace(/<(?:.|\n)*?>/gm, '')
            .replace(/\n/g, '')
            .replace(/(?:\s|[^\w])+/g, ' ')
            .split(" ")
            .filter(s => s && s.length > 2)
            .map(s => s.toLocaleUpperCase())
        ));
    }
    catch (e) {
        console.log("Index creation has failed.")
        return [];
    }
};

Array.prototype.removeDups = function(field) {
    if (field) {
        var seen = new Set();
        return this.filter(function(x) {
            var key = x[field], isNew = !seen.has(key);
            if (isNew) seen.add(key);
            return isNew;
        });
    }

    var local_array = this;
    return local_array.filter(function(elem, pos) {
        return local_array.indexOf(elem) === pos;
    });
};

String.prototype.capitalizeFirstLetter = function(string) {
    return this.charAt(0).toUpperCase() + this.slice(1);
};
