"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _postcssnested = /*#__PURE__*/ _interop_require_default(require("postcss-nested"));
const _postcssnesting = /*#__PURE__*/ _interop_require_default(require("postcss-nesting"));
const _extend = /*#__PURE__*/ _interop_require_default(require("./lib/plugins/extend"));
const _postcsscombineduplicatedselectors = /*#__PURE__*/ _interop_require_default(require("postcss-combine-duplicated-selectors"));
const _cssmqgroup = /*#__PURE__*/ _interop_require_default(require("css-mqgroup"));
const _defaultConfig = /*#__PURE__*/ _interop_require_default(require("../stubs/defaultConfig"));
const _resolveConfig = /*#__PURE__*/ _interop_require_default(require("./util/resolveConfig"));
const _registerConfigAsDependency = /*#__PURE__*/ _interop_require_default(require("./lib/registerConfigAsDependency"));
const _resolveConfigPath = /*#__PURE__*/ _interop_require_default(require("./util/resolveConfigPath"));
const _plugins = /*#__PURE__*/ _interop_require_default(require("./lib/plugins"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
const getConfigFunction = (config)=>()=>{
        if (_lodash.default.isUndefined(config) && !_lodash.default.isObject(config)) {
            return (0, _resolveConfig.default)([
                _defaultConfig.default
            ]);
        }
        if (!_lodash.default.isObject(config)) {
            delete require.cache[require.resolve(config)];
        }
        return (0, _resolveConfig.default)([
            _lodash.default.isObject(config) ? config : require(config),
            _defaultConfig.default
        ]);
    };
module.exports = (config)=>{
    const resolvedConfigPath = (0, _resolveConfigPath.default)(config);
    const cfgFunction = getConfigFunction(resolvedConfigPath || config);
    const configuredEuropaPlugins = _plugins.default.map((plug)=>{
        return plug(cfgFunction);
    });
    const europaPipeline = [
        ...configuredEuropaPlugins
    ];
    if (!_lodash.default.isUndefined(resolvedConfigPath)) {
        europaPipeline.push((0, _registerConfigAsDependency.default)(resolvedConfigPath));
    }
    return {
        postcssPlugin: "europacss",
        plugins: [
            async function(root, result) {
                for (let plugin of result.processor.plugins){
                    if (plugin.postcssPlugin === "postcss-nested") {
                        throw new Error("europacss runs its own nesting plugin. please remove postcss-nested from your config");
                    }
                    if (plugin.postcssPlugin === "postcss-mqpacker") {
                        throw new Error("europacss runs its own media query packing plugin. please remove postcss-mqpacker from your config");
                    }
                    if (plugin.postcssPlugin === "@hail2u/css-mqpacker") {
                        throw new Error("europacss runs its own media query packing plugin. please remove @hail2u/css-mqpacker from your config");
                    }
                    if (plugin.postcssPlugin === "css-mqgroup") {
                        throw new Error("europacss runs its own media query packing plugin. please remove css-mqgroup from your config");
                    }
                    if (plugin.postcssPlugin === "postcss-combine-duplicated-selectors") {
                        throw new Error("europacss runs its own selector deduping plugin. please remove postcss-combine-duplicated-selectors from your config");
                    }
                }
                // run nesting
                result = await (0, _postcss.default)([
                    (0, _postcssnested.default)({
                        bubble: [
                            "responsive"
                        ]
                    })
                ]).process(root, result.opts);
                // then @extend all classes
                result = await (0, _postcss.default)([
                    (0, _extend.default)()
                ]).process(root, result.opts);
                // then we blast through the europaPipeline
                result = await (0, _postcss.default)(europaPipeline).process(root, result.opts);
                // try to lose all @nest garbage
                result = await (0, _postcss.default)([
                    (0, _postcssnesting.default)({
                        edition: "2021",
                        noIsPseudoSelector: true
                    })
                ]).process(root, result.opts);
                // then we run nesting again
                result = await (0, _postcss.default)([
                    (0, _postcssnested.default)()
                ]).process(root, result.opts);
                // then we sort mqs
                result = await (0, _postcss.default)([
                    (0, _cssmqgroup.default)({
                        sort: true
                    })
                ]).process(root, result.opts);
                // then finally combine selectors
                result = await (0, _postcss.default)([
                    (0, _postcsscombineduplicatedselectors.default)()
                ]).process(root, result.opts);
            }
        ]
    };
};
module.exports.postcss = true;
