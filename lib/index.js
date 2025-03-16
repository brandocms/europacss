"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _postcssnested = /*#__PURE__*/ _interop_require_default(require("postcss-nested"));
const _postcssnesting = /*#__PURE__*/ _interop_require_default(require("postcss-nesting"));
const _postcsspresetenv = /*#__PURE__*/ _interop_require_default(require("postcss-preset-env"));
const _extend = /*#__PURE__*/ _interop_require_default(require("./lib/plugins/extend"));
const _postcsscombineduplicatedselectors = /*#__PURE__*/ _interop_require_default(require("postcss-combine-duplicated-selectors"));
const _mqpacker = /*#__PURE__*/ _interop_require_default(require("./lib/plugins/postcss/mqpacker"));
const _defaultConfig = /*#__PURE__*/ _interop_require_default(require("../stubs/defaultConfig"));
const _resolveConfig = /*#__PURE__*/ _interop_require_default(require("./util/resolveConfig"));
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
    // Extract the europacss config and presetEnv options
    let europacssConfig = config;
    let presetEnvOptions = {};
    // If config is an object and has presetEnv property, extract it
    if (_lodash.default.isObject(config) && !_lodash.default.isUndefined(config.presetEnv)) {
        presetEnvOptions = config.presetEnv;
        // If the config also has an actual europacss config, use that
        if (!_lodash.default.isUndefined(config.config)) {
            europacssConfig = config.config;
        } else {
            // Otherwise, use config without the presetEnv prop
            europacssConfig = _lodash.default.omit(config, [
                "presetEnv"
            ]);
        }
    }
    // if europacssConfig is empty, set it as undefined
    if (_lodash.default.isEmpty(europacssConfig)) {
        europacssConfig = undefined;
    }
    const resolvedConfigPath = (0, _resolveConfigPath.default)(europacssConfig);
    const cfgFunction = getConfigFunction(resolvedConfigPath || europacssConfig);
    // Extract options for postcss-preset-env
    const usePresetEnv = _lodash.default.get(presetEnvOptions, "disable", false) !== true;
    // Default preset-env options
    const defaultPresetEnvOptions = {
        browsers: [
            "defaults"
        ],
        features: {
            "custom-properties": false
        }
    };
    // Merge default options with user-provided options
    const presetEnvConfig = _lodash.default.merge({}, defaultPresetEnvOptions, _lodash.default.omit(presetEnvOptions, [
        "disable"
    ]));
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
                    if (plugin.postcssPlugin === "css-mqgroup" || plugin.postcssPlugin === "europacss-mqpacker") {
                        throw new Error("europacss runs its own media query packing plugin. please remove css-mqgroup or europacss-mqpacker from your config");
                    }
                    if (plugin.postcssPlugin === "postcss-combine-duplicated-selectors") {
                        throw new Error("europacss runs its own selector deduping plugin. please remove postcss-combine-duplicated-selectors from your config");
                    }
                    if (plugin.postcssPlugin === "postcss-preset-env") {
                        throw new Error("europacss runs its own postcss-preset-env plugin. please remove postcss-preset-env from your config and pass options via europacss instead");
                    }
                    if (plugin.postcssPlugin === "autoprefixer") {
                        throw new Error("europacss runs postcss-preset-env which includes autoprefixer. please remove autoprefixer from your config");
                    }
                }
                if (resolvedConfigPath) {
                    result.messages.push({
                        type: "dependency",
                        file: resolvedConfigPath,
                        parent: root.source.input.file
                    });
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
                const configuredEuropaPlugins = _plugins.default.map((plug)=>{
                    return plug(cfgFunction);
                });
                const europaPipeline = [
                    ...configuredEuropaPlugins
                ];
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
                // Use our custom media query packer with mobile-first sorting
                result = await (0, _postcss.default)([
                    (0, _mqpacker.default)({
                        sort: true
                    })
                ]).process(root, result.opts);
                // then finally combine selectors
                result = await (0, _postcss.default)([
                    (0, _postcsscombineduplicatedselectors.default)()
                ]).process(root, result.opts);
                // Apply postcss-preset-env if enabled
                if (usePresetEnv) {
                    result = await (0, _postcss.default)([
                        (0, _postcsspresetenv.default)(presetEnvConfig)
                    ]).process(root, result.opts);
                }
            }
        ]
    };
};
module.exports.postcss = true;
