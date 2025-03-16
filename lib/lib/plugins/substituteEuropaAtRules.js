"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _fs = /*#__PURE__*/ _interop_require_default(require("fs"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _updateSource = /*#__PURE__*/ _interop_require_default(require("../../util/updateSource"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: 'europacss-europa',
        prepare ({ root }) {
            return {
                AtRule: {
                    europa: (atRule)=>{
                        if (atRule.params === 'base') {
                            const normalizeStyles = _postcss.default.parse(_fs.default.readFileSync(require.resolve('normalize.css'), 'utf8'));
                            const baseStyles = _postcss.default.parse(_fs.default.readFileSync(`${__dirname}/css/base.css`, 'utf8'));
                            prepend(root, (0, _updateSource.default)([
                                ...normalizeStyles.nodes,
                                ...baseStyles.nodes
                            ], atRule.source));
                            atRule.remove();
                        } else if (atRule.params === 'arrows') {
                            const styles = _postcss.default.parse(_fs.default.readFileSync(`${__dirname}/css/arrows.css`, 'utf8'));
                            prepend(root, (0, _updateSource.default)([
                                ...styles.nodes
                            ], atRule.source));
                            atRule.remove();
                        }
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
function prepend(css, styles) {
    css.prepend(styles);
}
