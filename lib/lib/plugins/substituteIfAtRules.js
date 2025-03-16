"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _cloneNodes = /*#__PURE__*/ _interop_require_default(require("../../util/cloneNodes"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: 'europacss-if',
        prepare () {
            return {
                AtRule: {
                    if: (atRule)=>{
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
    const nodes = atRule.nodes;
    if (!nodes) {
        throw atRule.error(`IF: Must include child nodes.`, {
            word: 'if'
        });
    }
    const params = atRule.params;
    if (!params) {
        throw atRule.error(`IF: Must include breakpoint selectors`, {
            word: 'if'
        });
    }
    // get the key
    const path = params.split('.');
    const obj = _lodash.default.get(config, path);
    if (obj === undefined) {
        throw atRule.error(`IF: not found: \`${params}\``, {
            word: params
        });
    }
    if (obj) {
        atRule.parent.append(...(0, _cloneNodes.default)(nodes));
    }
    atRule.remove();
}
