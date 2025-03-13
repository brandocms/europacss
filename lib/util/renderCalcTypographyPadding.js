"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, /**
 * Render padding calculation for typography based on a divider value
 * Supports both single divider value and breakpoint-specific dividers
 * 
 * @param {String|Number} val Value to be divided
 * @param {Object} config Configuration object containing typography settings
 * @param {String} [breakpoint] Current breakpoint (optional)
 * @returns {String} Calculated CSS value
 */ "default", {
    enumerable: true,
    get: function() {
        return renderCalcTypographyPadding;
    }
});
const _reducecsscalc = /*#__PURE__*/ _interop_require_default(require("reduce-css-calc"));
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function renderCalcTypographyPadding(val, { typography  }, breakpoint) {
    let divider;
    // Check if paddingDivider is an object with breakpoint-specific values
    if (_lodash.default.isPlainObject(typography.paddingDivider)) {
        // If breakpoint is provided and exists in the divider map, use that value
        if (breakpoint && typography.paddingDivider[breakpoint]) {
            divider = typography.paddingDivider[breakpoint];
        } else {
            // First try to use a 'default' key if it exists
            if (typography.paddingDivider.default) {
                divider = typography.paddingDivider.default;
            } else {
                const firstKey = Object.keys(typography.paddingDivider)[0];
                divider = typography.paddingDivider[firstKey] || 24 // Fallback to 24 if no values available
                ;
            }
        }
    } else {
        divider = typography.paddingDivider || 24 // Fallback to 24 if not defined
        ;
    }
    return (0, _reducecsscalc.default)(`calc(100% * ${val} / ${divider})`, 10);
}
