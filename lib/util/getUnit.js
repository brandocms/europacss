"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return getUnit;
    }
});
function getUnit(value) {
    const match = value.match(/px|rem|em|vw/);
    if (match) {
        return match.toString();
    }
    return null;
}
