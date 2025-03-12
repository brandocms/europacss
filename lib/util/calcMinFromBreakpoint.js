"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return calcMinFromBreakpoint;
    }
});
function calcMinFromBreakpoint(breakpoints, bpKey) {
    return breakpoints[bpKey];
}
