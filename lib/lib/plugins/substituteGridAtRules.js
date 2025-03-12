"use strict";

var _lodash = _interopRequireDefault(require("lodash"));
var _buildDecl = _interopRequireDefault(require("../../util/buildDecl"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * A simple shortcut for setting up a grid.
 * Sets column gap to gutter width across all breakpoints
 */

module.exports = getConfig => {
  const config = getConfig();
  return {
    postcssPlugin: 'europacss-grid',
    prepare() {
      return {
        AtRule: {
          grid: atRule => {
            processRule(atRule);
          }
        }
      };
    }
  };
};
module.exports.postcss = true;
function processRule(atRule) {
  const gridDecl = (0, _buildDecl.default)('display', 'grid');
  const gridTplDecl = (0, _buildDecl.default)('grid-template-columns', 'repeat(12, 1fr)');
  atRule.name = 'space';
  atRule.params = 'grid-column-gap 1';
  atRule.parent.insertBefore(atRule, gridDecl);
  atRule.parent.insertBefore(atRule, gridTplDecl);
}