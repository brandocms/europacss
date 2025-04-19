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
    return {
        postcssPlugin: 'europacss-europa',
        prepare ({ root }) {
            return {
                AtRule: {
                    europa: (atRule)=>{
                        if (atRule.params === 'base') {
                            const normalizePath = require.resolve('normalize.css');
                            const normalizeStyles = _postcss.default.parse(_fs.default.readFileSync(normalizePath, 'utf8'), {
                                from: normalizePath
                            });
                            const basePath = `${__dirname}/css/base.css`;
                            const baseStyles = _postcss.default.parse(_fs.default.readFileSync(basePath, 'utf8'), {
                                from: basePath
                            });
                            prepend(root, (0, _updateSource.default)([
                                ...normalizeStyles.nodes,
                                ...baseStyles.nodes
                            ], atRule.source));
                            atRule.remove();
                        } else if (atRule.params === 'arrows') {
                            const arrowsPath = `${__dirname}/css/arrows.css`;
                            const styles = _postcss.default.parse(_fs.default.readFileSync(arrowsPath, 'utf8'), {
                                from: arrowsPath
                            });
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
