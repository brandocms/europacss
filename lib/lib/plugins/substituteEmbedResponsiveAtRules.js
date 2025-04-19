"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _fs = /*#__PURE__*/ _interop_require_default(require("fs"));
const _buildDecl = /*#__PURE__*/ _interop_require_default(require("../../util/buildDecl"));
const _updateSource = /*#__PURE__*/ _interop_require_default(require("../../util/updateSource"));
const _reducecsscalc = /*#__PURE__*/ _interop_require_default(require("reduce-css-calc"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
/**
 * Embed responsive
 */ module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: 'europacss-embed-responsive',
        prepare () {
            return {
                AtRule: {
                    'embed-responsive': (atRule)=>{
                        processRule(atRule, config, false);
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule, _config, _flagAsImportant) {
    const src = atRule.source;
    if (atRule.parent.type === 'root') {
        throw atRule.error(`EMBED-RESPONSIVE: Can only be used inside a rule, not on root.`);
    }
    if (!atRule.params) {
        throw atRule.error(`EMBED-RESPONSIVE: Needs aspect ratio. I.e: @embed-responsive 16/9;`);
    }
    const ratio = atRule.params.split('/');
    const decls = [
        (0, _buildDecl.default)('padding-top', (0, _reducecsscalc.default)(`calc(${parseFloat(ratio[1])}/${parseFloat(ratio[0])}*100`) + '%')
    ];
    // create a :before rule
    const pseudoBefore = _postcss.default.rule({
        selector: '&::before'
    });
    pseudoBefore.source = src;
    atRule.parent.insertAfter(atRule, pseudoBefore.append(...decls));
    const embedPath = `${__dirname}/css/embed-responsive.css`;
    const styles = _postcss.default.parse(_fs.default.readFileSync(embedPath, 'utf8'), {
        from: embedPath
    });
    atRule.parent.insertAfter(atRule, (0, _updateSource.default)([
        ...styles.nodes
    ], src));
    atRule.remove();
}
