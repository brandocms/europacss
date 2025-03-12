"use strict";

var _lodash = _interopRequireDefault(require("lodash"));
var _buildDecl = _interopRequireDefault(require("../../util/buildDecl"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
module.exports = getConfig => {
  const config = getConfig();
  return {
    postcssPlugin: 'europacss-color',
    prepare() {
      return {
        AtRule: {
          color: atRule => {
            processRule(atRule, config, false);
          },
          'color!': atRule => {
            processRule(atRule, config, true);
          }
        }
      };
    }
  };
};
module.exports.postcss = true;
function processRule(atRule, config, flagAsImportant) {
  const parent = atRule.parent;
  if (parent.type === 'root') {
    throw atRule.error(`COLOR: Cannot run from root`, {
      word: 'color'
    });
  }
  let [target, color] = atRule.params.split(' ');
  if (!target || !color) {
    throw atRule.error(`COLOR: Must include target (fg/bg) and color property`, {
      word: 'color'
    });
  }

  // get the wanted object
  const theme = ['theme', 'colors'];
  const path = color.split('.');
  const resolvedColor = _lodash.default.get(config, theme.concat(path));
  let decl;
  switch (target) {
    case 'fg':
      decl = (0, _buildDecl.default)('color', resolvedColor || color, flagAsImportant);
      break;
    case 'bg':
      decl = (0, _buildDecl.default)('background-color', resolvedColor || color, flagAsImportant);
      break;
    case 'fill':
      decl = (0, _buildDecl.default)('fill', resolvedColor || color, flagAsImportant);
      break;
    case 'stroke':
      decl = (0, _buildDecl.default)('stroke', resolvedColor || color, flagAsImportant);
      break;
    case 'border':
      decl = (0, _buildDecl.default)('border-color', resolvedColor || color, flagAsImportant);
      break;
    case 'border-top':
      decl = (0, _buildDecl.default)('border-top-color', resolvedColor || color, flagAsImportant);
      break;
    case 'border-bottom':
      decl = (0, _buildDecl.default)('border-bottom-color', resolvedColor || color, flagAsImportant);
      break;
    case 'border-left':
      decl = (0, _buildDecl.default)('border-left-color', resolvedColor || color, flagAsImportant);
      break;
    case 'border-right':
      decl = (0, _buildDecl.default)('border-right-color', resolvedColor || color, flagAsImportant);
      break;
    default:
      throw atRule.error(`COLOR: target must be fg, bg, fill, stroke, border or border-[top|bottom|right|left]. Got \`${target}\``, {
        word: target
      });
  }
  atRule.parent.append(decl);
  atRule.remove();
}