// https://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript/24891600#24891600

var UUID = {};

UUID.trueRandom = (function() {
    var crypt = window.crypto;

    // if we have a crypto library, use it
    var random = function(min, max) {
        var rval = 0;
        var range = max - min;
        if (range < 2) {
            return min;
        }

        var bits_needed = Math.ceil(Math.log2(range));
        if (bits_needed > 53) {
            throw new Exception("We cannot generate numbers larger than 53 bits.");
        }
        var bytes_needed = Math.ceil(bits_needed / 8);
        var mask = Math.pow(2, bits_needed) - 1;
        // 7776 -> (2^13 = 8192) -1 == 8191 or 0x00001111 11111111

        // Create byte array and fill with N random numbers
        var byteArray = new Uint8Array(bytes_needed);
        crypt.getRandomValues(byteArray);

        var p = (bytes_needed - 1) * 8;
        for(var i = 0; i < bytes_needed; i++ ) {
            rval += byteArray[i] * Math.pow(2, p);
            p -= 8;
        }

        // Use & to apply the mask and reduce the number of recursive lookups
        rval = rval & mask;

        if (rval >= range) {
            // Integer out of acceptable range
            return random(min, max);
        }
        // Return an integer that falls within the range
        return min + rval;
    };
    return function() {
        var r = random(0, 1000000000) / 1000000000;
        return r;
    };
}());

UUID.generate = function(template) {
    return template.replace(/[xy]/g, function(c)    {
        var r = UUID.trueRandom() * 16 | 0,
            v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16).toUpperCase();
    });
};

UUID.iso  = function() {
    return UUID.generate('xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx');
};

UUID.numeric = function() {
    return UUID.generate('xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx');
};

export default UUID;
