"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _buildFullMediaQuery = /*#__PURE__*/ _interop_require_default(require("../../util/buildFullMediaQuery"));
const _buildMediaQueryQ = /*#__PURE__*/ _interop_require_default(require("../../util/buildMediaQueryQ"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _extractBreakpointKeys = /*#__PURE__*/ _interop_require_default(require("../../util/extractBreakpointKeys"));
const _buildDecl = /*#__PURE__*/ _interop_require_default(require("../../util/buildDecl"));
const _parseFontSizeQuery = /*#__PURE__*/ _interop_require_default(require("../../util/parseFontSizeQuery"));
const _findResponsiveParent = /*#__PURE__*/ _interop_require_default(require("../../util/findResponsiveParent"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
/**
 * FONTSIZE
 *
 * @param {fontSizeQuery} - size of font + optional adjustment + optional line height
 * @param [breakpoint]    - if this should only apply to ONE breakpoint
 *
 * Examples:
 *
 *    @fontsize xl;
 *    @fontsize xl(0.8)/2.1;
 *    @fontsize xl >md;
 *
 */ module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: 'europacss-fontsize',
        prepare ({ root }) {
            return {
                AtRule: {
                    fontsize: (atRule)=>processRule(atRule, config)
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule, config) {
    const { theme } = config;
    const { breakpoints, breakpointCollections, spacing } = theme;
    const src = atRule.source;
    if (atRule.parent.type === 'root') {
        throw atRule.error(`FONTSIZE: Can only be used inside a rule, not on root.`);
    }
    if (atRule.nodes) {
        throw atRule.error(`FONTSIZE: @fontsize should not include children.`);
    }
    // clone parent, but without atRule
    let clonedRule = atRule.clone();
    let [fontSizeQuery, bpQuery] = _postcss.default.list.space(clonedRule.params);
    let parent = atRule.parent;
    let responsiveParent = (0, _findResponsiveParent.default)(atRule);
    // Check if we're nested under a @responsive rule.
    // If so, we don't create a media query, and we also won't
    // accept a query param for @fontsize
    if (responsiveParent) {
        if (bpQuery) {
            throw clonedRule.error(`FONTSIZE: When nesting @fontsize under @responsive, we do not accept a breakpoints query.`, {
                name: bpQuery
            });
        }
        bpQuery = responsiveParent.__mediaQuery;
    }
    if (bpQuery) {
        // We have a q, like '>=sm'. Extract all breakpoints we need media queries for
        const affectedBreakpoints = (0, _extractBreakpointKeys.default)({
            breakpoints,
            breakpointCollections
        }, bpQuery);
        _lodash.default.each(affectedBreakpoints, (bp)=>{
            let parsedFontSizeQuery = (0, _parseFontSizeQuery.default)(clonedRule, config, fontSizeQuery, bp);
            const fontDecls = _lodash.default.keys(parsedFontSizeQuery).map((prop)=>(0, _buildDecl.default)(prop, parsedFontSizeQuery[prop]));
            const mediaRule = clonedRule.clone({
                name: 'media',
                params: (0, _buildMediaQueryQ.default)({
                    breakpoints,
                    breakpointCollections
                }, bp)
            });
            mediaRule.append(...fontDecls);
            mediaRule.source = src;
            atRule.before(mediaRule);
        });
    } else {
        _lodash.default.keys(breakpoints).forEach((bp)=>{
            let parsedFontSizeQuery = (0, _parseFontSizeQuery.default)(clonedRule, config, fontSizeQuery, bp);
            const fontDecls = _lodash.default.keys(parsedFontSizeQuery).map((prop)=>(0, _buildDecl.default)(prop, parsedFontSizeQuery[prop]));
            const mediaRule = clonedRule.clone({
                name: 'media',
                params: (0, _buildFullMediaQuery.default)(breakpoints, bp)
            });
            mediaRule.append(...fontDecls);
            mediaRule.source = src;
            atRule.before(mediaRule);
        });
    }
    atRule.remove();
    // check if parent has anything
    if (parent && !parent.nodes.length) {
        parent.remove();
    }
}
