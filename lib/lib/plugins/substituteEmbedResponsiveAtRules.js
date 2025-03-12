"use strict";

var _lodash = _interopRequireDefault(require("lodash"));
var _postcss = _interopRequireDefault(require("postcss"));
var _fs = _interopRequireDefault(require("fs"));
var _buildDecl = _interopRequireDefault(require("../../util/buildDecl"));
var _updateSource = _interopRequireDefault(require("../../util/updateSource"));
var _reduceCssCalc = _interopRequireDefault(require("reduce-css-calc"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Embed responsive
 */

module.exports = getConfig => {
  const config = getConfig();
  return {
    postcssPlugin: 'europacss-embed-responsive',
    prepare() {
      return {
        AtRule: {
          'embed-responsive': atRule => {
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
  const decls = [(0, _buildDecl.default)('padding-top', (0, _reduceCssCalc.default)(`calc(${parseFloat(ratio[1])}/${parseFloat(ratio[0])}*100`) + '%')];
  // create a :before rule
  const pseudoBefore = _postcss.default.rule({
    selector: '&::before'
  });
  pseudoBefore.source = src;
  atRule.parent.insertAfter(atRule, pseudoBefore.append(...decls));
  const styles = _postcss.default.parse(_fs.default.readFileSync(`${__dirname}/css/embed-responsive.css`, 'utf8'));
  atRule.parent.insertAfter(atRule, (0, _updateSource.default)([...styles.nodes], src));
  atRule.remove();
}