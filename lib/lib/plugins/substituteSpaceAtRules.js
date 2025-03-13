"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _buildFullMediaQuery = /*#__PURE__*/ _interop_require_default(require("../../util/buildFullMediaQuery"));
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
        postcssPlugin: "europacss-space",
        prepare () {
            return {
                AtRule: {
                    // Handle regular @space rule
                    space: (atRule)=>{
                        processRule(atRule, config, false);
                    },
                    // Handle @space! rule (important flag)
                    "space!": (atRule)=>{
                        processRule(atRule, config, true);
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule, config, flagAsImportant) {
    // Validate rule context
    if (atRule.parent.type === "root") {
        throw atRule.error(`SPACING: Should only be used inside a rule, not on root.`);
    }
    if (atRule.nodes) {
        throw atRule.error(`SPACING: Spacing should not include children.`);
    }
    const { theme: { breakpoints , breakpointCollections , spacing  }  } = config;
    const parent = atRule.parent;
    // Clone rule to act upon. We remove the atRule from DOM later, but
    // we still need some data from the original.
    const clonedRule = atRule.clone();
    let parsedBreakpoints;
    // Parse the rule parameters: property, size, and optional breakpoint query
    let [prop, size, bpQuery] = _postcss.default.list.space(clonedRule.params);
    // Special case for container
    if (prop === "container") {
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
        // Create media queries for each affected breakpoint
        _lodash.default.each(affectedBreakpoints, (bp)=>{
            // Parse size for this breakpoint
            const parsedSize = size ? (0, _parseSize.default)(clonedRule, config, size, bp) : null;
            // Build the CSS declarations
            const sizeDecls = (0, _buildDecl.default)(prop, parsedSize, flagAsImportant, config, bp);
            // Create media query rule
            const mediaRule = clonedRule.clone({
                name: "media",
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
    } else {
        // No breakpoint query specified
        if ((0, _sizeNeedsBreakpoints.default)(spacing, size)) {
            // Size is responsive, create media queries for all breakpoints
            _lodash.default.keys(breakpoints).forEach((bp)=>{
                const parsedSize = size ? (0, _parseSize.default)(clonedRule, config, size, bp) : null;
                const mediaRule = clonedRule.clone({
                    name: "media",
                    params: (0, _buildFullMediaQuery.default)(breakpoints, bp)
                });
                const sizeDecls = (0, _buildDecl.default)(prop, parsedSize, flagAsImportant, config, bp);
                mediaRule.append(sizeDecls);
                atRule.before(mediaRule);
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
