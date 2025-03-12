/**
 * Split `str` into value and unit. Returns value
 * @param {string} str
 */ "use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return getValue;
    }
});
function getValue(str) {
    const string = String(str);
    const val = parseFloat(string, 10);
    return val;
}
