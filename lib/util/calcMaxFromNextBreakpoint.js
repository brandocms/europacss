"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return calcMaxFromNextBreakpoint;
    }
});
const _calcMaxFromBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromBreakpoint"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function calcMaxFromNextBreakpoint(breakpoints, bpKey) {
    const keys = Object.keys(breakpoints);
    const idx = keys.indexOf(bpKey);
    if (idx <= keys.length - 1) {
        const nextKey = keys[idx + 1];
        return breakpoints[nextKey];
    }
    return (0, _calcMaxFromBreakpoint.default)(breakpoints, bpKey);
}
