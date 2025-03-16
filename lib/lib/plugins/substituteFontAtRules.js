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
 * Aliases and shortcuts to other at-rules
 */ module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: 'europacss-font',
        prepare () {
            return {
                AtRule: {
                    font: (atRule)=>{
                        processRule(atRule, config);
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule, config) {
    const parent = atRule.parent;
    if (parent.type === 'root') {
        throw atRule.error(`FONT: Can only be used inside a rule, not on root.`);
    }
    if (atRule.nodes) {
        throw atRule.error(`FONT: @font should not include children.`);
    }
    let [family, fsQuery, bpQuery] = _postcss.default.list.space(atRule.params);
    const fsParams = fsQuery ? fsQuery + (bpQuery ? ' ' + bpQuery : '') : null;
    let ff = config.theme.typography.families[family];
    if (!ff) {
        throw atRule.error(`FONT: Could not find \`${family}\` in typography.families config`);
    }
    if (ff.length) {
        ff = ff.join(',');
    }
    const decls = [
        (0, _buildDecl.default)('font-family', ff)
    ];
    if (fsParams) {
        // insert a @fontsize at rule after this
        const fsRule = _postcss.default.atRule({
            name: 'fontsize',
            params: fsParams
        });
        fsRule.source = atRule.source;
        parent.insertBefore(atRule, fsRule);
    }
    parent.append(...decls);
    atRule.remove();
}
