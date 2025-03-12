"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return parseRFS;
    }
});
const _calcMinFromBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMinFromBreakpoint"));
const _calcMaxFromBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromBreakpoint"));
const _getUnit = /*#__PURE__*/ _interop_require_default(require("./getUnit"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function parseRFS(node, config, size, breakpoint) {
    const [minSize, maxSize] = size.split("-");
    const sizeUnit = (0, _getUnit.default)(minSize);
    const maxSizeUnit = (0, _getUnit.default)(maxSize);
    let minWidth = (0, _calcMinFromBreakpoint.default)(config.theme.breakpoints, breakpoint);
    let maxWidth = (0, _calcMaxFromBreakpoint.default)(config.theme.breakpoints, breakpoint);
    if (!maxWidth) {
        // no max width for this breakpoint. Add 200 to min :)
        // TODO: maybe skip for the largest size? set a flag here and return reg size?
        maxWidth = `${parseFloat(minWidth) + 200}${(0, _getUnit.default)(minWidth)}`;
    }
    const widthUnit = (0, _getUnit.default)(minWidth);
    const maxWidthUnit = (0, _getUnit.default)(maxWidth);
    const rootSize = config.theme.typography.rootSize || "18px";
    if (sizeUnit === null) {
        throw node.error(`RFS: Sizes need unit values - breakpoint: ${breakpoint} - size: ${size}`);
    }
    if (sizeUnit !== maxSizeUnit && widthUnit !== maxWidthUnit) {
        throw node.error("RFS: min/max unit types must match");
    }
    if (sizeUnit === "rem" && widthUnit === "px") {
        minWidth = pxToRem(minWidth, rootSize);
        maxWidth = pxToRem(maxWidth, rootSize);
    }
    // Build the responsive type decleration
    const sizeDiff = parseFloat(maxSize) - parseFloat(minSize);
    const rangeDiff = parseFloat(maxWidth) - parseFloat(minWidth);
    if (sizeDiff === 0) {
        // not really responsive. just return the regular max
        return maxSize;
    }
    if (minWidth === "0") {
        minWidth = "320px";
    }
    return `calc(${minSize} + ${sizeDiff} * ((100vw - ${minWidth}) / ${rangeDiff}))`;
}
function pxToRem(px, rootSize) {
    return parseFloat(px) / parseFloat(rootSize) + "rem";
}
