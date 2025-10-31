"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _buildMediaQueryQ = /*#__PURE__*/ _interop_require_default(require("../../util/buildMediaQueryQ"));
const _findResponsiveParent = /*#__PURE__*/ _interop_require_default(require("../../util/findResponsiveParent"));
const _extractBreakpointKeys = /*#__PURE__*/ _interop_require_default(require("../../util/extractBreakpointKeys"));
const _buildDecl = /*#__PURE__*/ _interop_require_default(require("../../util/buildDecl"));
const _parseSize = /*#__PURE__*/ _interop_require_default(require("../../util/parseSize"));
const _sizeNeedsBreakpoints = /*#__PURE__*/ _interop_require_default(require("../../util/sizeNeedsBreakpoints"));
const _advancedBreakpointQuery = /*#__PURE__*/ _interop_require_default(require("../../util/advancedBreakpointQuery"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
/**
 * SPACE
 *
 * @param prop          - CSS property to modify (e.g., margin-top, padding)
 * @param size          - Size of spacing (e.g., xs, md, xl)
 * @param breakpoint    - Optional breakpoint query (e.g., desktop, >=md)
 *
 * Examples:
 *
 *    @space margin-top xl;         // Apply xl margin-top across all breakpoints
 *    @space margin-top sm xs;      // Apply sm margin-top only at xs breakpoint
 *    @space padding-x md >=tablet; // Apply md padding for tablet and up
 *
 */ module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: 'europacss-space',
        prepare () {
            return {
                AtRule: {
                    // Handle regular @space rule
                    space: (atRule)=>{
                        processRule(atRule, config, false);
                    },
                    // Handle @space! rule (important flag)
                    'space!': (atRule)=>{
                        processRule(atRule, config, true);
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
/**
 * Group breakpoints by equal values to optimize media queries
 * @param {Object} config - Configuration object
 * @param {String} size - The size identifier
 * @param {Array} breakpointKeys - Array of breakpoint names to process
 * @param {String} prop - The CSS property being modified
 * @returns {Object} Object where keys are values and values are breakpoint groups
 */ function groupBreakpointsByValue(clonedRule, config, size, breakpointKeys, prop, sizeMightUseDifferentValueForLargestBp = false) {
    const valueGroups = {};
    const orderedBreakpointKeys = [
        ...breakpointKeys
    ].sort((a, b)=>{
        // Sort breakpoints by value numerically (low to high)
        const valueA = parseInt(config.theme.breakpoints[a], 10) || 0;
        const valueB = parseInt(config.theme.breakpoints[b], 10) || 0;
        return valueA - valueB;
    });
    // Special case: setMaxForVw setting
    // When this is true, we need to handle the largest breakpoint separately
    // as it will have px values instead of vw values
    const largestBreakpoint = sizeMightUseDifferentValueForLargestBp ? orderedBreakpointKeys[orderedBreakpointKeys.length - 1] : null;
    // Special case: Handle container values based on both padding and maxWidth
    const isContainer = prop === 'container';
    // Parse size for each breakpoint and group by value
    orderedBreakpointKeys.forEach((bp)=>{
        // Special case: When using setMaxForVw, always treat the largest breakpoint as a separate group
        if (sizeMightUseDifferentValueForLargestBp && bp === largestBreakpoint) {
            const parsedSize = (0, _parseSize.default)(clonedRule, config, size, bp);
            const valueKey = String(parsedSize) + '_maxBreakpoint' // Ensure it's a unique key
            ;
            valueGroups[valueKey] = [
                bp
            ];
            return;
        }
        // For container, we need to compare both padding and maxWidth
        // Only merge if both values are the same
        if (isContainer) {
            // For container, we need to create a composite key with both padding and maxWidth
            const { theme } = config;
            // Only proceed if container config exists
            if (theme && theme.container) {
                // Create a composite key from both container properties
                const paddingValue = theme.container.padding && theme.container.padding[bp];
                const maxWidthValue = theme.container.maxWidth && theme.container.maxWidth[bp];
                const containerKey = `padding:${paddingValue},maxWidth:${maxWidthValue}`;
                if (!valueGroups[containerKey]) {
                    valueGroups[containerKey] = [];
                }
                valueGroups[containerKey].push(bp);
            } else {
                // If no container config, treat each breakpoint separately
                const uniqueKey = `container_${bp}`;
                valueGroups[uniqueKey] = [
                    bp
                ];
            }
            return;
        }
        // Regular case for non-container properties
        const parsedSize = (0, _parseSize.default)(clonedRule, config, size, bp);
        // Convert to string for comparison
        const valueKey = String(parsedSize);
        if (!valueGroups[valueKey]) {
            valueGroups[valueKey] = [];
        }
        valueGroups[valueKey].push(bp);
    });
    return valueGroups;
}
function processRule(atRule, config, flagAsImportant) {
    // Validate rule context
    if (atRule.parent.type === 'root') {
        throw atRule.error(`SPACING: Should only be used inside a rule, not on root.`);
    }
    if (atRule.nodes) {
        throw atRule.error(`SPACING: Spacing should not include children.`);
    }
    const { theme: { breakpoints, breakpointCollections, spacing } } = config;
    const parent = atRule.parent;
    // Clone rule to act upon. We remove the atRule from DOM later, but
    // we still need some data from the original.
    const clonedRule = atRule.clone();
    let parsedBreakpoints;
    // Parse the rule parameters: property, size, and optional breakpoint query
    let [prop, size, bpQuery] = _postcss.default.list.space(clonedRule.params);
    // Special case for container
    if (prop === 'container') {
        bpQuery = size;
        size = null;
    }
    // Check if we're nested under a @responsive rule.
    // If so, we don't create a media query, and we also won't
    // accept a query param for @space
    const responsiveParent = (0, _findResponsiveParent.default)(atRule);
    if (responsiveParent) {
        // Under @responsive, we can't have a breakpoint query in @space
        if (bpQuery) {
            throw clonedRule.error(`SPACING: @space cannot be nested under @responsive and have a breakpoint query.`, {
                name: bpQuery
            });
        }
        // Use the parent's media query
        bpQuery = responsiveParent.__mediaQuery;
        // For advanced queries, parse the breakpoints
        if ((0, _advancedBreakpointQuery.default)(responsiveParent.__mediaQuery)) {
            parsedBreakpoints = (0, _extractBreakpointKeys.default)({
                breakpoints,
                breakpointCollections
            }, responsiveParent.__mediaQuery);
        }
    }
    const src = atRule.source;
    // Parse breakpoints from advanced query if not already processed
    if (!parsedBreakpoints && bpQuery && (0, _advancedBreakpointQuery.default)(bpQuery)) {
        parsedBreakpoints = (0, _extractBreakpointKeys.default)({
            breakpoints,
            breakpointCollections
        }, bpQuery);
    }
    if (bpQuery) {
        // We have a breakpoint query, extract all affected breakpoints
        let affectedBreakpoints = parsedBreakpoints || (0, _extractBreakpointKeys.default)({
            breakpoints,
            breakpointCollections
        }, bpQuery);
        // If we have a breakpoint query that extracted multiple breakpoints,
        // check if they would all have the same value
        if (affectedBreakpoints.length > 1 && (0, _advancedBreakpointQuery.default)(bpQuery)) {
            // Group by value to find breakpoints with identical values
            const valueGroups = {};
            // Special handling for container: group by padding+maxWidth combination
            if (prop === 'container') {
                const { theme } = config;
                if (theme && theme.container) {
                    affectedBreakpoints.forEach((bp)=>{
                        // Create a composite key from both container properties
                        const paddingValue = theme.container.padding && theme.container.padding[bp];
                        const maxWidthValue = theme.container.maxWidth && theme.container.maxWidth[bp];
                        const containerKey = `padding:${paddingValue},maxWidth:${maxWidthValue}`;
                        if (!valueGroups[containerKey]) {
                            valueGroups[containerKey] = [];
                        }
                        valueGroups[containerKey].push(bp);
                    });
                } else {
                    // If no container config, treat each breakpoint separately
                    affectedBreakpoints.forEach((bp)=>{
                        const uniqueKey = `container_${bp}`;
                        valueGroups[uniqueKey] = [
                            bp
                        ];
                    });
                }
            } else {
                // Regular handling for non-container properties
                // Map each breakpoint to its parsed size
                const breakpointValues = affectedBreakpoints.map((bp)=>{
                    return {
                        bp,
                        value: size ? (0, _parseSize.default)(clonedRule, config, size, bp) : null
                    };
                });
                breakpointValues.forEach(({ bp, value })=>{
                    // Convert value to string for comparison
                    const valueKey = String(value);
                    if (!valueGroups[valueKey]) {
                        valueGroups[valueKey] = [];
                    }
                    valueGroups[valueKey].push(bp);
                });
            }
            // Create one media query per unique value
            Object.entries(valueGroups).forEach(([valueKey, bps])=>{
                if (bps.length > 0) {
                    // Use the original query expression if all breakpoints have the same value
                    const queryExpression = bps.length === affectedBreakpoints.length ? bpQuery : bps.join('/');
                    // Parse size for the first breakpoint in the group (they all have the same value)
                    const parsedSize = size ? (0, _parseSize.default)(clonedRule, config, size, bps[0]) : null;
                    // Build the CSS declarations
                    const sizeDecls = (0, _buildDecl.default)(prop, parsedSize, flagAsImportant, config, bps[0]);
                    // Create media query rule using the optimized query expression
                    const mediaRule = clonedRule.clone({
                        name: 'media',
                        params: (0, _buildMediaQueryQ.default)({
                            breakpoints,
                            breakpointCollections
                        }, queryExpression)
                    });
                    // Add declarations and insert before the @space rule
                    mediaRule.append(sizeDecls);
                    mediaRule.source = src;
                    atRule.before(mediaRule);
                }
            });
        } else {
            // Handle single breakpoint case
            _lodash.default.each(affectedBreakpoints, (bp)=>{
                // Parse size for this breakpoint
                const parsedSize = size ? (0, _parseSize.default)(clonedRule, config, size, bp) : null;
                // Build the CSS declarations
                const sizeDecls = (0, _buildDecl.default)(prop, parsedSize, flagAsImportant, config, bp);
                // Create media query rule
                const mediaRule = clonedRule.clone({
                    name: 'media',
                    params: (0, _buildMediaQueryQ.default)({
                        breakpoints,
                        breakpointCollections
                    }, bp)
                });
                // Add declarations and insert before the @space rule
                mediaRule.append(sizeDecls);
                mediaRule.source = src;
                atRule.before(mediaRule);
            });
        }
    } else {
        // No breakpoint query specified
        if ((0, _sizeNeedsBreakpoints.default)(spacing, size)) {
            // Get all breakpoint keys
            const breakpointKeys = _lodash.default.keys(breakpoints);
            // Check if size might use different values for largest breakpoint (for setMaxForVw optimization)
            const hasMaxForVw = config && config.setMaxForVw === true;
            const sizeMightUseDifferentValueForLargestBp = hasMaxForVw && (typeof size === 'string' && (size.includes('vw') || size.includes('dpx')) || config.theme.spacing && config.theme.spacing[size] && Object.values(config.theme.spacing[size]).some((val)=>typeof val === 'string' && (val.includes('vw') || val.includes('dpx'))));
            // Group breakpoints with equal values
            const groupedBreakpoints = groupBreakpointsByValue(clonedRule, config, size, breakpointKeys, prop, sizeMightUseDifferentValueForLargestBp);
            // if the last key in groupedBreakpoints ends with _maxBreakpoint,
            // and we only have ONE other key, we only need to create one media query
            // for the _maxBreakpoint value
            const lastKey = _lodash.default.last(Object.keys(groupedBreakpoints));
            const hasMaxBreakpoint = lastKey.endsWith('_maxBreakpoint');
            const hasOnlyOneOtherKey = Object.keys(groupedBreakpoints).length === 2;
            // For each distinct value, create a media query with the combined breakpoints
            Object.entries(groupedBreakpoints).forEach(([value, bps])=>{
                const isMaxBreakpoint = value.endsWith('_maxBreakpoint');
                if (bps.length > 0) {
                    // Parse size for the first breakpoint in the group (they all have the same value)
                    const parsedSize = size ? (0, _parseSize.default)(clonedRule, config, size, bps[0]) : null;
                    // Build the CSS declarations
                    const sizeDecls = (0, _buildDecl.default)(prop, parsedSize, flagAsImportant, config, bps[0]);
                    // Special case: If we're targeting all breakpoints and there's only one value,
                    // we don't need a media query at all - can add directly to parent
                    // However, when using setMaxForVw with dpx/vw units, we want separate media queries
                    // even if we have only one other key, because the values are actually different
                    if (bps.length === breakpointKeys.length || hasMaxBreakpoint && hasOnlyOneOtherKey && !isMaxBreakpoint && !sizeMightUseDifferentValueForLargestBp) {
                        // This value applies to all breakpoints, so no media query needed
                        parent.prepend(sizeDecls);
                    } else {
                        // If multiple breakpoints have the same value, join them with "/"
                        const bpString = bps.join('/');
                        // Create media query rule with the combined breakpoint string
                        const mediaRule = clonedRule.clone({
                            name: 'media',
                            // Use the combined string for building the media query
                            params: (0, _buildMediaQueryQ.default)({
                                breakpoints,
                                breakpointCollections
                            }, bpString)
                        });
                        // Add declarations and insert before the @space rule
                        mediaRule.append(sizeDecls);
                        mediaRule.source = src;
                        atRule.before(mediaRule);
                    }
                }
            });
        } else {
            // Size is not responsive, add directly to parent rule
            const parsedSize = (0, _parseSize.default)(clonedRule, config, size);
            const sizeDecls = (0, _buildDecl.default)(prop, parsedSize, flagAsImportant);
            parent.prepend(sizeDecls);
        }
    }
    // Cleanup - remove the original @space rule
    atRule.remove();
    // Remove parent if it's now empty
    if (parent && !parent.nodes.length) {
        parent.remove();
    }
}
