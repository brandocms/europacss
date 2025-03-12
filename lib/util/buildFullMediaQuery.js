"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, // builds with MIN AND MAX
"default", {
    enumerable: true,
    get: function() {
        return buildFullMediaQuery;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _calcMaxFromBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromBreakpoint"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function buildFullMediaQuery(breakpoints, breakpoint) {
    const min = breakpoints[breakpoint];
    const max = (0, _calcMaxFromBreakpoint.default)(breakpoints, breakpoint);
    let screens = {
        min,
        ...max && {
            max
        }
    };
    if (!Array.isArray(screens)) {
        screens = [
            screens
        ];
    }
    return (0, _lodash.default)(screens).map((screen)=>{
        return (0, _lodash.default)(screen).map((value, feature)=>{
            feature = _lodash.default.get({
                min: "min-width",
                max: "max-width"
            }, feature, feature);
            return `(${feature}: ${value})`;
        }).join(" and ");
    }).join(", ");
}
