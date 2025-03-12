"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _reducecsscalc = /*#__PURE__*/ _interop_require_default(require("reduce-css-calc"));
const _buildFullMediaQuery = /*#__PURE__*/ _interop_require_default(require("../../util/buildFullMediaQuery"));
const _buildMediaQueryQ = /*#__PURE__*/ _interop_require_default(require("../../util/buildMediaQueryQ"));
const _extractBreakpointKeys = /*#__PURE__*/ _interop_require_default(require("../../util/extractBreakpointKeys"));
const _buildDecl = /*#__PURE__*/ _interop_require_default(require("../../util/buildDecl"));
const _parseSize = /*#__PURE__*/ _interop_require_default(require("../../util/parseSize"));
const _advancedBreakpointQuery = /*#__PURE__*/ _interop_require_default(require("../../util/advancedBreakpointQuery"));
const _splitBreakpoints = /*#__PURE__*/ _interop_require_default(require("../../util/splitBreakpoints"));
const _findResponsiveParent = /*#__PURE__*/ _interop_require_default(require("../../util/findResponsiveParent"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
/**
 * For some reason, Firefox is not consistent with how it calculates vw widths.
 * This manifests through our `@column` helper when wrapping. Sometimes when
 * resizing, it will flicker the element down to the next row and up again, as
 * if there is not enough room for the specified number of items to flex before
 * wrap. We try to circumvent this by setting the element's `max-width` 0.002vw
 * wider than the flex-basis.
 */ const FIX_FIREFOX_FLEX_VW_BUG = true;
/**
 * COLUMN
 *
 * @param {sizeQuery}
 * @param [breakpointQuery]
 * @param [alignment]
 *
 * Examples:
 *
 *    @column 6/12;
 *    @column 6/12 xs;
 *    @column 6/12 xs center;
 *
 *    @column 6:1/12;
 *    @column calc(var[6/12]);
 *
 */ module.exports = (getConfig)=>{
    const config = getConfig();
    const finalRules = [];
    return {
        postcssPlugin: "europacss-column",
        prepare ({ root  }) {
            return {
                AtRule: {
                    column: (atRule)=>processRule(atRule, config)
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule, config) {
    const { theme: { breakpoints , breakpointCollections  }  } = config;
    const src = atRule.source;
    const parent = atRule.parent;
    let [suppliedSize, suppliedBreakpoint] = _postcss.default.list.space(atRule.params);
    let needsBreakpoints = false;
    let alreadyResponsive = false;
    let flexDecls = [];
    if (parent.type === "root") {
        throw atRule.error(`COLUMN: Can only be used inside a rule, not on root.`);
    }
    if (suppliedSize.indexOf("@") > -1) {
        throw atRule.error(`COLUMN: Old size@breakpoint syntax is removed. Use a space instead`);
    }
    const responsiveParent = (0, _findResponsiveParent.default)(atRule);
    // Check if we're nested under a @responsive rule.
    // If so, we don't create a media query, and we also won't
    // accept a query param for @space
    if (responsiveParent) {
        if (suppliedBreakpoint) {
            throw atRule.error(`COLUMN: When nesting @column under @responsive, we do not accept a breakpoints query.`, {
                name: suppliedBreakpoint
            });
        }
        // try to grab the breakpoint
        if ((0, _advancedBreakpointQuery.default)(responsiveParent.__mediaQuery)) {
            // parse the breakpoints
            suppliedBreakpoint = (0, _extractBreakpointKeys.default)({
                breakpoints,
                breakpointCollections
            }, responsiveParent.__mediaQuery).join("/");
        } else {
            suppliedBreakpoint = responsiveParent.__mediaQuery;
        }
        if (suppliedBreakpoint.indexOf("/") > -1) {
            // multiple breakpoints, we can't use the breakpoints
            alreadyResponsive = false;
        } else {
            alreadyResponsive = true;
        }
    }
    if (!suppliedBreakpoint) {
        needsBreakpoints = true;
    }
    if (suppliedBreakpoint && (0, _advancedBreakpointQuery.default)(suppliedBreakpoint)) {
        suppliedBreakpoint = (0, _extractBreakpointKeys.default)({
            breakpoints,
            breakpointCollections
        }, suppliedBreakpoint).join("/");
    }
    if (needsBreakpoints) {
        _lodash.default.keys(breakpoints).forEach((bp)=>{
            let parsedSize = (0, _parseSize.default)(atRule, config, suppliedSize, bp);
            flexDecls = [];
            createFlexDecls(flexDecls, parsedSize);
            const mediaRule = _postcss.default.atRule({
                name: "media",
                params: (0, _buildFullMediaQuery.default)(breakpoints, bp)
            });
            mediaRule.append(...flexDecls);
            atRule.before(mediaRule);
        });
    } else {
        // has suppliedBreakpoint, either from a @responsive parent, or a supplied bpQuery
        if (alreadyResponsive) {
            flexDecls = [];
            let parsedSize = (0, _parseSize.default)(atRule, config, suppliedSize, suppliedBreakpoint);
            createFlexDecls(flexDecls, parsedSize);
            parent.prepend(...flexDecls);
        } else {
            (0, _splitBreakpoints.default)(suppliedBreakpoint).forEach((bp)=>{
                flexDecls = [];
                let parsedSize = (0, _parseSize.default)(atRule, config, suppliedSize, bp);
                createFlexDecls(flexDecls, parsedSize);
                const mediaRule = _postcss.default.atRule({
                    name: "media",
                    params: (0, _buildMediaQueryQ.default)({
                        breakpoints,
                        breakpointCollections
                    }, bp)
                });
                mediaRule.source = src;
                mediaRule.append(...flexDecls);
                const sendToRoot = _postcss.default.atRule({
                    name: "at-root"
                });
                sendToRoot.append(mediaRule);
                atRule.before(mediaRule);
            });
        }
    }
    atRule.remove();
    // check if parent has anything
    if (parent && !parent.nodes.length) {
        parent.remove();
    }
}
function createFlexDecls(flexDecls, flexSize) {
    let maxWidth;
    if (flexSize.includes("vw") && FIX_FIREFOX_FLEX_VW_BUG) {
        maxWidth = (0, _reducecsscalc.default)(`calc(${flexSize} - 0.002vw)`, 6);
    } else {
        maxWidth = flexSize;
    }
    flexDecls.push((0, _buildDecl.default)("position", "relative"));
    flexDecls.push((0, _buildDecl.default)("flex-grow", "0"));
    flexDecls.push((0, _buildDecl.default)("flex-shrink", "0"));
    flexDecls.push((0, _buildDecl.default)("flex-basis", flexSize));
    flexDecls.push((0, _buildDecl.default)("max-width", maxWidth));
}
