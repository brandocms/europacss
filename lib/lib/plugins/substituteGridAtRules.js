"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _buildDecl = /*#__PURE__*/ _interop_require_default(require("../../util/buildDecl"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
/**
 * A simple shortcut for setting up a grid.
 * Sets column gap to gutter width across all breakpoints
 */ module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: "europacss-grid",
        prepare () {
            return {
                AtRule: {
                    grid: (atRule)=>{
                        processRule(atRule);
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule) {
    const gridDecl = (0, _buildDecl.default)("display", "grid");
    const gridTplDecl = (0, _buildDecl.default)("grid-template-columns", "repeat(12, 1fr)");
    atRule.name = "space";
    atRule.params = "grid-column-gap 1";
    atRule.parent.insertBefore(atRule, gridDecl);
    atRule.parent.insertBefore(atRule, gridTplDecl);
}
