"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return renderCalcTypographyPadding;
    }
});
const _reducecsscalc = /*#__PURE__*/ _interop_require_default(require("reduce-css-calc"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function renderCalcTypographyPadding(val, { typography: { paddingDivider  }  }) {
    // TODO: should paddingDivider be a map of breakpoints? Different divider values per breakpoint?
    return (0, _reducecsscalc.default)(`calc(100% * ${val} / ${paddingDivider})`, 10);
}
