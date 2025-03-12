"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return multipleBreakpoints;
    }
});
function multipleBreakpoints(bpQuery) {
    if (bpQuery.indexOf("/") > -1) {
        return true;
    }
    if (bpQuery.indexOf("$") > -1) {
        return true;
    }
    return false;
}
