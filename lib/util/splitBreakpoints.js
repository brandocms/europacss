"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return splitBreakpoints;
    }
});
function splitBreakpoints(bpQuery) {
    if (bpQuery.indexOf('/') > -1) {
        return bpQuery.split('/');
    }
    return [
        bpQuery
    ];
}
