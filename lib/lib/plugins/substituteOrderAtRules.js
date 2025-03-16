"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _buildDecl = /*#__PURE__*/ _interop_require_default(require("../../util/buildDecl"));
const _findResponsiveParent = /*#__PURE__*/ _interop_require_default(require("../../util/findResponsiveParent"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
/**
 * A shortcut for responsive order rules
 */ module.exports = ()=>{
    return {
        postcssPlugin: 'europacss-order',
        prepare ({ root }) {
            return {
                AtRule: {
                    order: (atRule)=>processRule(atRule)
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule) {
    const src = atRule.source;
    let wrapInResponsive = false;
    const parent = atRule.parent;
    if (parent.type === 'root') {
        throw atRule.error(`ORDER: Can only be used inside a rule, not on root.`);
    }
    if (atRule.nodes) {
        throw atRule.error(`ORDER: @order should not include children.`);
    }
    let [order = null, bpQuery = null] = _postcss.default.list.space(atRule.params);
    if (bpQuery) {
        wrapInResponsive = true;
    }
    let clonedRule = atRule.clone();
    // Check if we're nested under a @responsive rule.
    // If so, we don't create a media query, and we also won't
    // accept a query param for @order
    const responsiveParent = (0, _findResponsiveParent.default)(atRule);
    if (responsiveParent) {
        if (bpQuery) {
            throw clonedRule.error(`ORDER: When nesting @order under @responsive, we do not accept a breakpoints query.`, {
                name: bpQuery
            });
        }
        bpQuery = responsiveParent.params;
    }
    const decls = [
        (0, _buildDecl.default)('order', order)
    ];
    if (wrapInResponsive) {
        const responsiveRule = _postcss.default.atRule({
            name: 'responsive',
            params: bpQuery
        });
        responsiveRule.source = src;
        responsiveRule.append(...decls);
        parent.insertBefore(atRule, responsiveRule);
    } else {
        parent.prepend(...decls);
    }
    atRule.remove();
}
