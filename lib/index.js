"use strict";

var _lodash = _interopRequireDefault(require("lodash"));
var _postcss = _interopRequireDefault(require("postcss"));
var _postcssNested = _interopRequireDefault(require("postcss-nested"));
var _extend = _interopRequireDefault(require("./lib/plugins/extend"));
var _postcssCombineDuplicatedSelectors = _interopRequireDefault(require("postcss-combine-duplicated-selectors"));
var _cssMqgroup = _interopRequireDefault(require("css-mqgroup"));
var _defaultConfig = _interopRequireDefault(require("../stubs/defaultConfig"));
var _resolveConfig = _interopRequireDefault(require("./util/resolveConfig"));
var _registerConfigAsDependency = _interopRequireDefault(require("./lib/registerConfigAsDependency"));
var _resolveConfigPath = _interopRequireDefault(require("./util/resolveConfigPath"));
var _plugins = _interopRequireDefault(require("./lib/plugins"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// import postcssExtendRule from 'postcss-extend-rule'
// import postcssExtendRule from '@outstand/postcss-extend-rule'

const getConfigFunction = config => () => {
  if (_lodash.default.isUndefined(config) && !_lodash.default.isObject(config)) {
    return (0, _resolveConfig.default)([_defaultConfig.default]);
  }
  if (!_lodash.default.isObject(config)) {
    delete require.cache[require.resolve(config)];
  }
  return (0, _resolveConfig.default)([_lodash.default.isObject(config) ? config : require(config), _defaultConfig.default]);
};
module.exports = config => {
  const resolvedConfigPath = (0, _resolveConfigPath.default)(config);
  const cfgFunction = getConfigFunction(resolvedConfigPath || config);
  const configuredEuropaPlugins = _plugins.default.map(plug => {
    return plug(cfgFunction);
  });
  const europaPipeline = [...configuredEuropaPlugins];
  if (!_lodash.default.isUndefined(resolvedConfigPath)) {
    europaPipeline.push((0, _registerConfigAsDependency.default)(resolvedConfigPath));
  }
  return {
    postcssPlugin: 'europacss',
    plugins: [async function (root, result) {
      for (let plugin of result.processor.plugins) {
        if (plugin.postcssPlugin === 'postcss-nested') {
          throw new Error('europacss runs its own nesting plugin. please remove postcss-nested from your config');
        }
        if (plugin.postcssPlugin === 'postcss-mqpacker') {
          throw new Error('europacss runs its own media query packing plugin. please remove postcss-mqpacker from your config');
        }
        if (plugin.postcssPlugin === '@hail2u/css-mqpacker') {
          throw new Error('europacss runs its own media query packing plugin. please remove @hail2u/css-mqpacker from your config');
        }
        if (plugin.postcssPlugin === 'css-mqgroup') {
          throw new Error('europacss runs its own media query packing plugin. please remove css-mqgroup from your config');
        }
        if (plugin.postcssPlugin === 'postcss-combine-duplicated-selectors') {
          throw new Error('europacss runs its own selector deduping plugin. please remove postcss-combine-duplicated-selectors from your config');
        }
      }

      // run nesting
      result = await (0, _postcss.default)([(0, _postcssNested.default)({
        bubble: ['responsive']
      })]).process(root, result.opts);

      // then @extend all classes
      console.log('extend!');
      result = await (0, _postcss.default)([(0, _extend.default)()]).process(root, result.opts);

      // then we blast through the europaPipeline
      result = await (0, _postcss.default)(europaPipeline).process(root, result.opts);

      // then we run nesting again
      result = await (0, _postcss.default)([(0, _postcssNested.default)()]).process(root, result.opts);

      // then we sort mqs
      result = await (0, _postcss.default)([(0, _cssMqgroup.default)({
        sort: true
      })]).process(root, result.opts);

      // then finally combine selectors
      result = await (0, _postcss.default)([(0, _postcssCombineDuplicatedSelectors.default)()]).process(root, result.opts);
    }]
  };
};
module.exports.postcss = true;