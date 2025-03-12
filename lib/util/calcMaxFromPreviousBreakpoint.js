"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return calcMaxFromPreviousBreakpoint;
    }
});
const _calcMaxFromBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromBreakpoint"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function calcMaxFromPreviousBreakpoint(breakpoints, bpKey) {
    const keys = Object.keys(breakpoints);
    const idx = keys.indexOf(bpKey);
    if (idx > 0) {
        return `${parseInt(breakpoints[bpKey].replace("px", "")) - 1}px`;
    }
    return (0, _calcMaxFromBreakpoint.default)(breakpoints, bpKey);
}
