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
            // Use modern width syntax instead of min-width/max-width
            if (feature === "min") {
                // Skip min constraint if it's 0
                if (value === "0" || value === "0px") {
                    return null; // This will be filtered out
                }
                return `(width >= ${value})`;
            } else if (feature === "max") {
                return `(width <= ${value})`;
            } else {
                return `(${feature}: ${value})`;
            }
        }).filter(Boolean) // Remove null values (skipped min: 0)
        .join(" and ");
    }).join(", ");
}
