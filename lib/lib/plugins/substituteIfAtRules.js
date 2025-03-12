"use strict";

var _lodash = _interopRequireDefault(require("lodash"));
var _postcss = _interopRequireDefault(require("postcss"));
var _cloneNodes = _interopRequireDefault(require("../../util/cloneNodes"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
module.exports = getConfig => {
  const config = getConfig();
  return {
    postcssPlugin: 'europacss-if',
    prepare() {
      return {
        AtRule: {
          if: atRule => {
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