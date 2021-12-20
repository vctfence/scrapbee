String.prototype.repeat || (String.prototype.repeat = function(count) {
    if (count < 1) return '';
    var result = '', pattern = this.valueOf();
    while (count > 1) {
        if (count & 1) result += pattern;
        count >>= 1, pattern += pattern;
    }
    return result + pattern;
});

String.prototype.startsWith || (String.prototype.startsWith = function(word) {
    return this.lastIndexOf(word, 0) === 0;
});

String.prototype.includes || (String.prototype.includes = function(word) {
    return this.indexOf(word, 0) >= 0;
});