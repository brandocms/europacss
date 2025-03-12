"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _buildDecl = /*#__PURE__*/ _interop_require_default(require("../../util/buildDecl"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
/**
 * Display. Basically a shortcut for responsive display rules
 */ module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: "europacss-display",
        prepare () {
            return {
                AtRule: {
                    display: (atRule)=>{
                        processRule(atRule, config);
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule, config) {
    const src = atRule.source;
    let selector;
    let wrapInResponsive = false;
    const parent = atRule.parent;
    let grandParent = atRule.parent.parent;
    if (parent.type === "root") {
        throw atRule.error(`DISPLAY: Can only be used inside a rule, not on root.`);
    }
    if (atRule.nodes) {
        throw atRule.error(`DISPLAY: @display should not include children.`);
    }
    let [displayQ = null, bpQuery = null] = _postcss.default.list.space(atRule.params);
    if (bpQuery) {
        wrapInResponsive = true;
    }
    let clonedRule = atRule.clone();
    // Check if we're nested under a @responsive rule.
    // If so, we don't create a media query, and we also won't
    // accept a query param for @space
    if (parent.type === "atrule" && parent.name === "responsive") {
        if (bpQuery) {
            throw clonedRule.error(`DISPLAY: When nesting @display under @responsive, we do not accept a breakpoints query.`, {
                name: bpQuery
            });
        }
        bpQuery = parent.params;
        if (grandParent.selector) {
            selector = grandParent.selector;
        }
    } else if (grandParent.name === "responsive") {
        // check if grandparent is @responsive
        if (bpQuery) {
            throw clonedRule.error(`DISPLAY: When nesting @display under @responsive, we do not accept a breakpoints query.`, {
                name: bpQuery
            });
        }
        bpQuery = grandParent.params;
        if (parent.selector[0] === "&") {
            selector = parent.selector.replace("&", grandParent.parent.selector);
        } else {
            selector = parent.selector;
        }
    }
    if (!selector && parent.selector) {
        selector = parent.selector;
    }
    let [displayParam, flexDirection, flexWrap] = displayQ.split("/");
    const decls = [
        (0, _buildDecl.default)("display", displayParam)
    ];
    if (flexDirection) {
        decls.push((0, _buildDecl.default)("flex-direction", flexDirection));
    }
    if (flexWrap) {
        decls.push((0, _buildDecl.default)("flex-wrap", flexWrap));
    }
    if (wrapInResponsive) {
        const responsiveRule = _postcss.default.atRule({
            name: "responsive",
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
