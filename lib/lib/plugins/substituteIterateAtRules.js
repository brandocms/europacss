"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: "europacss-iterate",
        prepare () {
            return {
                AtRule: {
                    iterate: (atRule)=>{
                        processRule(atRule, config);
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule, config) {
    const finalRules = [];
    const parent = atRule.parent;
    if (parent.type === "root") {
        throw atRule.error(`ITERATE: Cannot run from root`, {
            word: "iterate"
        });
    }
    const nodes = atRule.nodes;
    if (!nodes) {
        throw atRule.error(`ITERATE: Must include child nodes.`, {
            word: "iterate"
        });
    }
    const params = atRule.params;
    if (!params) {
        throw atRule.error(`ITERATE: Must include iterable parameter`, {
            word: "iterate"
        });
    }
    if (params.indexOf(".") === -1) {
        throw atRule.error(`ITERATE: Can't iterate theme object. Supply a path: \`spacing.md\``, {
            word: "iterate"
        });
    }
    // get the wanted object
    const path = params.split(".");
    const obj = _lodash.default.get(config, path);
    if (!obj) {
        throw atRule.error(`ITERATE: iterable not found: \`${params}\``, {
            word: params
        });
    }
    // iterate through the params object
    _lodash.default.keys(obj).forEach((key)=>{
        let value = obj[key];
        // we clone the nodes for every key
        let clone = atRule.clone();
        clone.walkAtRules((r)=>{
            r.params = r.params.replace("$key", key);
            r.params = r.params.replace("$value", value);
            r.walkDecls((d)=>{
                d.value = d.value.replace("$value", value);
            });
        });
        clone.walkDecls((d)=>{
            d.prop = d.prop.replace("$key", key);
            d.value = d.value.replace("$key", key);
            d.value = d.value.replace("$value", value);
        });
        finalRules.push(clone.nodes);
    });
    atRule.parent.append(...finalRules);
    atRule.remove();
}
