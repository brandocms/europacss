"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, // builds with MIN only. Fine for when iterating through all breakpoints
// for single breakpoints, use buildSpecificMediaQuery
"default", {
    enumerable: true,
    get: function() {
        return buildMediaQuery;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function buildMediaQuery(breakpoints, breakpoint) {
    let screens = breakpoints[breakpoint];
    if (_lodash.default.isString(screens)) {
        screens = {
            min: screens
        };
    }
    if (!Array.isArray(screens)) {
        screens = [
            screens
        ];
    }
    return (0, _lodash.default)(screens).map((screen)=>{
        return (0, _lodash.default)(screen).map((value, feature)=>{
            // Use modern width syntax instead of min-width/max-width
            if (feature === "min") {
                return `(width >= ${value})`;
            } else if (feature === "max") {
                return `(width <= ${value})`;
            } else {
                return `(${feature}: ${value})`;
            }
        }).join(" and ");
    }).join(", ");
}
