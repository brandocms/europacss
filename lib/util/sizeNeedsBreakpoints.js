"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return sizeNeedsBreakpoints;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function sizeNeedsBreakpoints(spacingMap, size) {
    if (!size) {
        return true;
    }
    // Leave css vars as single breakpoint
    if (size.startsWith('var(--')) {
        return false;
    }
    // Zero stays the same across all breakpoints
    if (size === 0 || size === '0') {
        return false;
    }
    // 'auto' stays the same across all breakpoints
    if (size === 'auto') {
        return false;
    }
    // Fractions should have breakpoints cause of gutters
    if (size.indexOf('/') !== -1) {
        return true;
    }
    // Size is in spacing map, we need breakpoints
    if (_lodash.default.has(spacingMap, size)) {
        return true;
    }
    // skip vw here due to maxPx
    const endingsToCheck = [
        'px',
        'em',
        'vh',
        'vmin',
        'vmax'
    ];
    let endsWithAny = endingsToCheck.some((ending)=>size.endsWith(ending));
    if (endsWithAny) {
        return false;
    }
    // regular numbers are treated as gutter multipliers/dividers, and
    // these differ per breakpoint.
    return true;
}
