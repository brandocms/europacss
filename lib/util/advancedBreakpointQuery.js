"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return advancedBreakpointQuery;
    }
});
function advancedBreakpointQuery(bpQuery) {
    if (bpQuery.indexOf(">") > -1) {
        return true;
    }
    if (bpQuery.indexOf("<") > -1) {
        return true;
    }
    if (bpQuery.indexOf("$") > -1) {
        return true;
    }
    return false;
}
