"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return renderCalc;
    }
});
const _reducecsscalc = /*#__PURE__*/ _interop_require_default(require("reduce-css-calc"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function renderCalc(val) {
    return (0, _reducecsscalc.default)(`calc(${val})`, 150);
}
