"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _buildFullMediaQuery = /*#__PURE__*/ _interop_require_default(require("../../util/buildFullMediaQuery"));
const _buildMediaQueryQ = /*#__PURE__*/ _interop_require_default(require("../../util/buildMediaQueryQ"));
const _findResponsiveParent = /*#__PURE__*/ _interop_require_default(require("../../util/findResponsiveParent"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
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
 * @param prop          - prop to modify
 * @param size          - size of spacing
 * @param breakpoint    - if this should only apply to ONE breakpoint
 *
 * Examples:
 *
 *    @space margin-top xl;
 *    @space margin-top sm xs;
 *
 */ module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: "europacss-space",
        prepare () {
            return {
                AtRule: {
                    space: (atRule)=>{
                        processRule(atRule, config, false);
                    },
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
    let clonedRule = atRule.clone();
    let parsedBreakpoints;
    let [prop, size, bpQuery] = _postcss.default.list.space(clonedRule.params);
    if (prop === "container") {
        bpQuery = size;
        size = null;
    }
    // Check if we're nested under a @responsive rule.
    // If so, we don't create a media query, and we also won't
    // accept a query param for @space
    const responsiveParent = (0, _findResponsiveParent.default)(atRule);
    if (responsiveParent) {
        if (bpQuery) {
            throw clonedRule.error(`SPACING: @space cannot be nested under @responsive and have a breakpoint query.`, {
                name: bpQuery
            });
        }
        bpQuery = responsiveParent.__mediaQuery;
        // try to grab the breakpoint
        if ((0, _advancedBreakpointQuery.default)(responsiveParent.__mediaQuery)) {
            // parse the breakpoints
            parsedBreakpoints = (0, _extractBreakpointKeys.default)({
                breakpoints,
                breakpointCollections
            }, responsiveParent.__mediaQuery);
        }
    }
    const src = atRule.source;
    if (!parsedBreakpoints && bpQuery && (0, _advancedBreakpointQuery.default)(bpQuery)) {
        parsedBreakpoints = (0, _extractBreakpointKeys.default)({
            breakpoints,
            breakpointCollections
        }, bpQuery);
    }
    if (bpQuery) {
        // We have a breakpoint query, like '>=sm'. Extract all breakpoints
        // we need media queries for. Since there is a breakpoint query, we
        // HAVE to generate breakpoints even if the sizeQuery doesn't
        // call for it.
        let affectedBreakpoints;
        if (!parsedBreakpoints) {
            affectedBreakpoints = (0, _extractBreakpointKeys.default)({
                breakpoints,
                breakpointCollections
            }, bpQuery);
        } else {
            affectedBreakpoints = parsedBreakpoints;
        }
        _lodash.default.each(affectedBreakpoints, (bp)=>{
            let parsedSize = null;
            if (size) {
                parsedSize = (0, _parseSize.default)(clonedRule, config, size, bp);
            }
            const sizeDecls = (0, _buildDecl.default)(prop, parsedSize, flagAsImportant, config, bp);
            const mediaRule = clonedRule.clone({
                name: "media",
                params: (0, _buildMediaQueryQ.default)({
                    breakpoints,
                    breakpointCollections
                }, bp)
            });
            mediaRule.append(sizeDecls);
            mediaRule.source = src;
            atRule.before(mediaRule);
        });
    } else {
        if ((0, _sizeNeedsBreakpoints.default)(spacing, size)) {
            _lodash.default.keys(breakpoints).forEach((bp)=>{
                let parsedSize = null;
                if (size) {
                    parsedSize = (0, _parseSize.default)(clonedRule, config, size, bp);
                }
                const mediaRule = clonedRule.clone({
                    name: "media",
                    params: (0, _buildFullMediaQuery.default)(breakpoints, bp)
                });
                const sizeDecls = (0, _buildDecl.default)(prop, parsedSize, flagAsImportant, config, bp);
                mediaRule.append(sizeDecls);
                atRule.before(mediaRule);
            });
        } else {
            const parsedSize = (0, _parseSize.default)(clonedRule, config, size);
            const sizeDecls = (0, _buildDecl.default)(prop, parsedSize, flagAsImportant);
            parent.prepend(sizeDecls);
        }
    }
    atRule.remove();
    // check if parent has anything
    if (parent && !parent.nodes.length) {
        parent.remove();
    }
}
