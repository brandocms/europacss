"use strict";

var _lodash = _interopRequireDefault(require("lodash"));
var _postcssNested = _interopRequireDefault(require("postcss-nested"));
var _postcssExtendRule = _interopRequireDefault(require("@outstand/postcss-extend-rule"));
var _defaultConfig = _interopRequireDefault(require("../stubs/defaultConfig"));
var _resolveConfig = _interopRequireDefault(require("./util/resolveConfig"));
var _registerConfigAsDependency = _interopRequireDefault(require("./lib/registerConfigAsDependency"));
var _formatCSS = _interopRequireDefault(require("./lib/formatCSS"));
var _resolveConfigPath = _interopRequireDefault(require("./util/resolveConfigPath"));
var _plugins = _interopRequireDefault(require("./lib/plugins"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
const getConfigFunction = config => () => {
  if (_lodash.default.isUndefined(config) && !_lodash.default.isObject(config)) {
    return (0, _resolveConfig.default)([_defaultConfig.default]);
  }
  if (!_lodash.default.isObject(config)) {
    delete require.cache[require.resolve(config)];
  }
  return (0, _resolveConfig.default)([_lodash.default.isObject(config) ? config : require(config), _defaultConfig.default]);
};

/**
 *
 * TODO
 *
 * kan vi gjøre samme som tw har gjort med @extend? dvs vi kaller den først med sync,
 * så alle pluginsene våre etterpå?
 *
 * https://github.com/postcss/postcss/issues/1712
 * https://github.com/tailwindlabs/tailwindcss/blob/v3/src/postcss-plugins/nesting/plugin.js
 *
 */

module.exports = config => {
  const resolvedConfigPath = (0, _resolveConfigPath.default)(config);
  const cfgFunction = getConfigFunction(resolvedConfigPath || config);
  const preludium = [(0, _postcssExtendRule.default)(), (0, _postcssNested.default)({
    bubble: ['responsive']
  })];
  const postludium = [_formatCSS.default];
  const configuredEuropaPlugins = _plugins.default.map(plug => {
    return plug(cfgFunction);
  });
  const pipeline = [...preludium, ...configuredEuropaPlugins, ...postludium];
  if (!_lodash.default.isUndefined(resolvedConfigPath)) {
    pipeline.push((0, _registerConfigAsDependency.default)(resolvedConfigPath));
  }
  return {
    postcssPlugin: 'europacss',
    plugins: [...pipeline]
  };
};
module.exports.postcss = true;