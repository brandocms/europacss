"use strict";

var _lodash = _interopRequireDefault(require("lodash"));
var _buildMediaQueryQ = _interopRequireDefault(require("../../util/buildMediaQueryQ"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
module.exports = getConfig => {
  const config = getConfig();
  const finalRules = [];
  return {
    postcssPlugin: 'europacss-responsive',
    prepare() {
      return {
        AtRule: {
          responsive: atRule => {
            processRule(atRule, config, finalRules);
          }
        }
      };
    }
  };
};
module.exports.postcss = true;
function processRule(atRule, config, _finalRules, _flagAsImportant) {
  const {
    theme: {
      breakpoints,
      breakpointCollections
    }
  } = config;
  if (!atRule.params) {
    throw atRule.error(`RESPONSIVE: Must include breakpoint selectors`, {
      word: 'responsive'
    });
  }
  // Build the media query string from the params
  const mediaQuery = (0, _buildMediaQueryQ.default)({
    breakpoints,
    breakpointCollections
  }, atRule.params);

  // Rename the rule and update its parameters
  atRule.name = 'media';
  atRule.__mediaQuery = atRule.params;
  atRule.params = mediaQuery;
  atRule.__isResponsive = true;
}