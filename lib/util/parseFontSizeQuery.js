"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, /**
 * Parse a font size query and convert it to CSS properties
 *
 * @param {object} node PostCSS node for error reporting
 * @param {object} config Configuration object
 * @param {string} fontSizeQuery The font size query to parse
 * @param {string} breakpoint Current breakpoint
 * @returns {object} Font properties object
 */ "default", {
    enumerable: true,
    get: function() {
        return parseFontSizeQuery;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _splitUnit = /*#__PURE__*/ _interop_require_default(require("./splitUnit"));
const _parseRFSQuery = /*#__PURE__*/ _interop_require_default(require("./parseRFSQuery"));
const _parseVWQuery = /*#__PURE__*/ _interop_require_default(require("./parseVWQuery"));
const _replaceWildcards = /*#__PURE__*/ _interop_require_default(require("./replaceWildcards"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
// Constants
const BETWEEN_EXPRESSION = 'between(';
const SLASH_SEPARATOR = '/';
const VW_UNIT = 'vw';
const DPX_UNIT = 'dpx';
/**
 * Extract line height from font size query if present
 *
 * @param {string} fontSizeQuery The font size query string
 * @returns {Array} Array containing [fontSizeQuery, lineHeight]
 */ function extractLineHeight(fontSizeQuery) {
    let lineHeight;
    if (fontSizeQuery.indexOf(SLASH_SEPARATOR) !== -1) {
        // we have a line-height parameter
        ;
        [fontSizeQuery, lineHeight] = fontSizeQuery.split(SLASH_SEPARATOR);
    }
    return [
        fontSizeQuery,
        lineHeight
    ];
}
/**
 * Extract font size modifier from query if present (e.g., xs(1.6))
 *
 * @param {string} fontSizeQuery The font size query string
 * @returns {Array} Array containing [fontSizeQuery, modifier]
 */ function extractModifier(fontSizeQuery) {
    let modifier;
    if (fontSizeQuery.indexOf(BETWEEN_EXPRESSION) === -1 && fontSizeQuery.indexOf('(') !== -1) {
        // we have a modifier xs(1.6) --> multiplies the size with 1.6
        modifier = fontSizeQuery.match(/\((.*)\)/)[1];
        fontSizeQuery = fontSizeQuery.split('(')[0];
    }
    return [
        fontSizeQuery,
        modifier
    ];
}
/**
 * Get reference viewport width for a breakpoint or breakpoint collection
 *
 * @param {object} config Configuration object
 * @param {string} breakpoint Current breakpoint
 * @param {object} node PostCSS node for warning
 * @returns {number} Reference viewport width
 */ function getReferenceViewportWidth(config, breakpoint, node) {
    // Check if we have dpxViewportSizes config
    if (config.dpxViewportSizes && typeof config.dpxViewportSizes === 'object') {
        // First check if we have a direct breakpoint match
        if (config.dpxViewportSizes[breakpoint]) {
            return config.dpxViewportSizes[breakpoint];
        }
        // Check if breakpoint is part of a collection with a reference width
        if (config.theme && config.theme.breakpointCollections) {
            for (const [collection, breakpoints] of Object.entries(config.theme.breakpointCollections)){
                if (breakpoints.split('/').includes(breakpoint) && config.dpxViewportSizes[collection]) {
                    return config.dpxViewportSizes[collection];
                }
            }
        }
    }
    // Fall back to global setting or default
    return config.dpxViewportSize || 1440;
}
/**
 * Process design-pixel (dpx) units
 * Converts dpx values to vw units based on a reference viewport width
 *
 * @param {string} fontSize The font size value with dpx unit
 * @param {string|null} lineHeight Optional line height value
 * @param {string} breakpoint Current breakpoint
 * @param {object} config Configuration object
 * @param {object} node PostCSS node for error reporting
 * @returns {object} Processed font size and line height properties
 */ function processDpxUnits(fontSize, lineHeight, breakpoint, config, node) {
    // Extract the numeric value from the font size
    const [fs, _fsUnit] = (0, _splitUnit.default)(fontSize);
    // Get the reference viewport width for this breakpoint or collection
    const referenceViewportWidth = getReferenceViewportWidth(config, breakpoint, node);
    // Calculate the equivalent vw value: (fontSize / referenceWidth) * 100
    const fsVw = (fs / referenceViewportWidth * 100).toFixed(5);
    // Handle validation for mixing units
    if (lineHeight && lineHeight.endsWith(VW_UNIT)) {
        throw node.error(`FONTSIZE: Mixing dpx and vw is not allowed with fontsize and lineheight`, {
            name: breakpoint
        });
    }
    // Handle line height if it also uses dpx units
    if (lineHeight && lineHeight.endsWith(DPX_UNIT)) {
        const [lh, _lhUnit] = (0, _splitUnit.default)(lineHeight);
        const lhVw = (lh / referenceViewportWidth * 100).toFixed(5);
        return (0, _parseVWQuery.default)(node, config, `${fsVw}vw`, `${lhVw}vw`, breakpoint, false);
    }
    // Return font size as vw with original line height if provided
    return {
        'font-size': (0, _parseVWQuery.default)(node, config, `${fsVw}vw`, lineHeight, breakpoint, true),
        ...lineHeight && {
            'line-height': lineHeight
        }
    };
}
/**
 * Process viewport width (vw) units
 *
 * @param {string} fontSize The font size value with vw unit
 * @param {string|null} lineHeight Optional line height value
 * @param {string} breakpoint Current breakpoint
 * @param {object} config Configuration object
 * @param {object} node PostCSS node for error reporting
 * @returns {object} Processed font size and line height properties
 */ function processVwUnits(fontSize, lineHeight, breakpoint, config, node) {
    if (lineHeight && lineHeight.endsWith(VW_UNIT)) {
        return (0, _parseVWQuery.default)(node, config, fontSize, lineHeight, breakpoint, false);
    } else {
        return {
            'font-size': (0, _parseVWQuery.default)(node, config, fontSize, lineHeight, breakpoint, true),
            ...lineHeight && {
                'line-height': lineHeight
            }
        };
    }
}
/**
 * Process regular CSS units (px, rem, em, etc.)
 *
 * @param {string} fontSize The font size value
 * @param {string|null} lineHeight Optional line height value
 * @returns {object} Font size and line height properties
 */ function processRegularUnits(fontSize, lineHeight) {
    return {
        'font-size': fontSize,
        ...lineHeight && {
            'line-height': lineHeight
        }
    };
}
/**
 * Apply modifier to font size
 *
 * @param {string|object} resolvedFontsize The font size value or object
 * @param {string} modifier The modifier value
 * @param {string} breakpoint Current breakpoint
 * @param {string|null} lineHeight Optional line height
 * @returns {object} Font size and line height properties
 */ function applyModifier(resolvedFontsize, modifier, breakpoint, lineHeight) {
    let fs;
    if (_lodash.default.isString(resolvedFontsize)) {
        fs = resolvedFontsize;
    } else if (_lodash.default.isObject(resolvedFontsize[breakpoint])) {
        fs = resolvedFontsize[breakpoint]['font-size'];
    } else {
        fs = resolvedFontsize[breakpoint];
    }
    const [val, unit] = (0, _splitUnit.default)(fs);
    const renderedFontSize = `${val * modifier}${unit}`;
    return {
        'font-size': renderedFontSize,
        ...lineHeight && {
            'line-height': lineHeight
        }
    };
}
/**
 * Process object-based font size definition
 *
 * @param {object} fontSizeObj The font size object for the breakpoint
 * @param {string|null} lineHeight Optional line height
 * @param {string} breakpoint Current breakpoint
 * @param {object} config Configuration object
 * @param {object} node PostCSS node for error reporting
 * @returns {object} Processed font properties
 */ function processObjectFontSize(fontSizeObj, lineHeight, breakpoint, config, node) {
    const props = {};
    _lodash.default.keys(fontSizeObj).forEach((key)=>{
        const value = fontSizeObj[key];
        if (value.endsWith(VW_UNIT)) {
            props[key] = (0, _parseVWQuery.default)(node, config, value, lineHeight, breakpoint, true);
        } else if (value.endsWith(DPX_UNIT)) {
            const [fs, _fsUnit] = (0, _splitUnit.default)(value);
            const referenceViewportWidth = getReferenceViewportWidth(config, breakpoint, node);
            const fsVw = (fs / referenceViewportWidth * 100).toFixed(5);
            props[key] = (0, _parseVWQuery.default)(node, config, `${fsVw}vw`, lineHeight, breakpoint, true);
        } else {
            props[key] = value;
        }
    });
    return props;
}
function parseFontSizeQuery(node, config, fontSizeQuery, breakpoint) {
    // Extract line height and modifier if present
    let lineHeight;
    let modifier;
    [fontSizeQuery, lineHeight] = extractLineHeight(fontSizeQuery);
    [fontSizeQuery, modifier] = extractModifier(fontSizeQuery);
    // Resolve font size from theme configuration
    const themePath = [
        'theme',
        'typography',
        'sizes'
    ];
    const fontSize = fontSizeQuery;
    const path = fontSize.split('.');
    let resolvedFontsize = _lodash.default.get(config, themePath.concat(path));
    if (!resolvedFontsize) {
        resolvedFontsize = fontSize;
    }
    // Early return for responsive font size with between() expression
    if (_lodash.default.isString(resolvedFontsize) && resolvedFontsize.indexOf(BETWEEN_EXPRESSION) !== -1) {
        return (0, _parseRFSQuery.default)(node, config, resolvedFontsize, lineHeight, breakpoint);
    }
    // Handle non-object font size definitions
    if (!_lodash.default.isString(resolvedFontsize)) {
        resolvedFontsize = (0, _replaceWildcards.default)(resolvedFontsize, config);
        if (!_lodash.default.has(resolvedFontsize, breakpoint)) {
            throw node.error(`FONTSIZE: No breakpoint \`${breakpoint}\` found in theme.typography.sizes.${fontSize}`, {
                name: breakpoint
            });
        }
    }
    // Apply modifier if present
    if (modifier) {
        return applyModifier(resolvedFontsize, modifier, breakpoint, lineHeight);
    }
    // Process string-based font sizes
    if (_lodash.default.isString(resolvedFontsize)) {
        // Check for line height in the font size definition
        if (!lineHeight && resolvedFontsize.indexOf(SLASH_SEPARATOR) !== -1) {
            ;
            [resolvedFontsize, lineHeight] = resolvedFontsize.split(SLASH_SEPARATOR);
        }
        // Handle different unit types
        if (resolvedFontsize.endsWith(VW_UNIT)) {
            return processVwUnits(resolvedFontsize, lineHeight, breakpoint, config, node);
        } else if (resolvedFontsize.endsWith(DPX_UNIT)) {
            return processDpxUnits(resolvedFontsize, lineHeight, breakpoint, config, node);
        } else {
            return processRegularUnits(resolvedFontsize, lineHeight);
        }
    }
    // Process object-based font sizes
    let bpFontSize = resolvedFontsize[breakpoint];
    if (_lodash.default.isObject(bpFontSize)) {
        return processObjectFontSize(bpFontSize, lineHeight, breakpoint, config, node);
    } else {
        // Handle string-based breakpoint font size
        let localLineHeight = lineHeight;
        if (!localLineHeight && bpFontSize.indexOf(SLASH_SEPARATOR) !== -1) {
            const parts = bpFontSize.split(SLASH_SEPARATOR);
            bpFontSize = parts[0];
            localLineHeight = parts[1];
        }
        // Handle between expression
        if (bpFontSize.indexOf(BETWEEN_EXPRESSION) !== -1) {
            return (0, _parseRFSQuery.default)(node, config, bpFontSize, localLineHeight, breakpoint);
        }
        // Handle different unit types
        if (bpFontSize.endsWith(VW_UNIT)) {
            return processVwUnits(bpFontSize, localLineHeight, breakpoint, config, node);
        } else if (bpFontSize.endsWith(DPX_UNIT)) {
            return processDpxUnits(bpFontSize, localLineHeight, breakpoint, config, node);
        } else {
            return processRegularUnits(bpFontSize, localLineHeight);
        }
    }
}
