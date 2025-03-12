"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return calcMaxFromBreakpoint;
    }
});
function calcMaxFromBreakpoint(breakpoints, bpKey) {
    const keys = Object.keys(breakpoints);
    const idx = keys.indexOf(bpKey);
    if (idx < keys.length - 1) {
        const nextKey = keys[idx + 1];
        return `${parseInt(breakpoints[nextKey].replace("px", "")) - 1}px`;
    }
    return null;
}
