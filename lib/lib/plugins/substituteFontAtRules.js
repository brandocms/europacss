"use strict";

var _lodash = _interopRequireDefault(require("lodash"));
var _postcss = _interopRequireDefault(require("postcss"));
var _buildDecl = _interopRequireDefault(require("../../util/buildDecl"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/**
 * Aliases and shortcuts to other at-rules
 */
module.exports = getConfig => {
  const config = getConfig();
  return {
    postcssPlugin: 'europacss-font',
    prepare() {
      return {
        AtRule: {
          font: atRule => {
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
  const decls = [(0, _buildDecl.default)('font-family', ff)];
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