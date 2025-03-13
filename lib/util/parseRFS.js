"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, /**
 * Parse Responsive Font Size (RFS) settings and generate a responsive font size calculation
 * @param {Object} node - PostCSS node
 * @param {Object} config - Configuration object
 * @param {String} size - Size range in format "minSize-maxSize"
 * @param {String} breakpoint - Current breakpoint
 * @returns {String} Calculated responsive font size expression
 */ "default", {
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
    // Validate and process size values
    validateSizeValues(node, minSize, maxSize, breakpoint);
    // Calculate breakpoint widths
    const { minWidth , maxWidth  } = calculateBreakpointWidths(config, breakpoint, minSize);
    // Calculate size difference
    const sizeDiff = calculateSizeDifference(minSize, maxSize);
    // Handle non-responsive case
    if (sizeDiff === 0) {
        return maxSize;
    }
    // Calculate range difference
    const rangeDiff = parseFloat(maxWidth) - parseFloat(minWidth);
    // Build and return the responsive formula
    return `calc(${minSize} + ${sizeDiff} * ((100vw - ${minWidth}) / ${rangeDiff}))`;
}
/**
 * Validate size values and ensure units are consistent
 * @param {Object} node - PostCSS node
 * @param {String} minSize - Minimum size value
 * @param {String} maxSize - Maximum size value
 * @param {String} breakpoint - Current breakpoint
 * @throws {Error} If size values don't have units or units don't match
 */ function validateSizeValues(node, minSize, maxSize, breakpoint) {
    const sizeUnit = (0, _getUnit.default)(minSize);
    const maxSizeUnit = (0, _getUnit.default)(maxSize);
    if (sizeUnit === null) {
        throw node.error(`RFS: Sizes need unit values - breakpoint: ${breakpoint} - size: ${minSize}-${maxSize}`);
    }
    if (sizeUnit !== maxSizeUnit) {
        throw node.error("RFS: min/max unit types must match");
    }
}
/**
 * Calculate breakpoint min and max widths
 * @param {Object} config - Configuration object
 * @param {String} breakpoint - Current breakpoint
 * @param {String} minSize - The minimum size value with units
 * @returns {Object} Object with minWidth and maxWidth
 */ function calculateBreakpointWidths(config, breakpoint, minSize) {
    let minWidth = (0, _calcMinFromBreakpoint.default)(config.theme.breakpoints, breakpoint);
    let maxWidth = (0, _calcMaxFromBreakpoint.default)(config.theme.breakpoints, breakpoint);
    // Handle missing max width
    if (!maxWidth) {
        // No max width for this breakpoint. Add 200 to min
        // TODO: consider better handling for largest breakpoint
        maxWidth = `${parseFloat(minWidth) + 200}${(0, _getUnit.default)(minWidth)}`;
    }
    // Ensure unit consistency
    const widthUnit = (0, _getUnit.default)(minWidth);
    const maxWidthUnit = (0, _getUnit.default)(maxWidth);
    const rootSize = config.theme.typography.rootSize || "18px";
    if (widthUnit !== maxWidthUnit) {
        throw new Error("RFS: min/max unit types must match");
    }
    // Convert to rem if needed
    const minSizeUnit = (0, _getUnit.default)(minSize);
    if (minSizeUnit === "rem" && widthUnit === "px") {
        minWidth = pxToRem(minWidth, rootSize);
        maxWidth = pxToRem(maxWidth, rootSize);
    }
    // Use sensible default for minWidth if it's zero
    if (minWidth === "0") {
        minWidth = "320px";
    }
    return {
        minWidth,
        maxWidth
    };
}
/**
 * Calculate the difference between max and min sizes
 * @param {String} minSize - Minimum size value
 * @param {String} maxSize - Maximum size value
 * @returns {Number} Size difference
 */ function calculateSizeDifference(minSize, maxSize) {
    return parseFloat(maxSize) - parseFloat(minSize);
}
/**
 * Convert a pixel value to rem
 * @param {String} px - Pixel value
 * @param {String} rootSize - Root font size
 * @returns {String} Rem value
 */ function pxToRem(px, rootSize) {
    return parseFloat(px) / parseFloat(rootSize) + "rem";
}
