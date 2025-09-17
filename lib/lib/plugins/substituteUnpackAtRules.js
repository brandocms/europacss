"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _buildDecl = /*#__PURE__*/ _interop_require_default(require("../../util/buildDecl"));
const _parseSize = /*#__PURE__*/ _interop_require_default(require("../../util/parseSize"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: 'europacss-unpack',
        prepare () {
            return {
                AtRule: {
                    unpack: (atRule)=>{
                        processRule(atRule, config);
                    }
                }
            };
        }
    };
};
module.exports.postcss = true;
function processRule(atRule, config) {
    const src = atRule.source;
    const parent = atRule.parent;
    const params = atRule.params;
    if (!params) {
        throw atRule.error(`UNPACK: Must include iterable parameter`, {
            word: 'unpack'
        });
    }
    if (params === 'containerPadding') {
        // unpack container values to css vars
        const obj = _lodash.default.get(config, [
            'theme',
            'container',
            'padding'
        ]);
        if (!obj) {
            throw atRule.error(`UNPACK: iterable not found: \`${params}\``, {
                word: params
            });
        }
        // iterate through breakpoints
        _lodash.default.keys(obj).forEach((breakpoint)=>{
            let value = obj[breakpoint];
            // Process dpx units in the value if present
            if (typeof value === 'string' && value.includes('dpx')) {
                value = (0, _parseSize.default)({
                    error: ()=>{}
                }, config, value, breakpoint);
            }
            // build decls for each k/v
            const decls = [
                (0, _buildDecl.default)('--container-padding', value)
            ];
            // build a responsive rule with these decls
            const responsiveRule = _postcss.default.atRule({
                name: 'responsive',
                params: breakpoint
            });
            responsiveRule.source = src;
            responsiveRule.append(...decls);
            atRule.parent.append(responsiveRule);
        });
        atRule.remove();
        return;
    }
    if (params === 'gridGutter') {
        // unpack container values to css vars
        const obj = _lodash.default.get(config, [
            'theme',
            'columns',
            'gutters'
        ]);
        if (!obj) {
            throw atRule.error(`UNPACK: iterable not found: \`${params}\``, {
                word: params
            });
        }
        // iterate through breakpoints
        _lodash.default.keys(obj).forEach((breakpoint)=>{
            let value = obj[breakpoint];
            // Process dpx units in the value if present
            if (typeof value === 'string' && value.includes('dpx')) {
                value = (0, _parseSize.default)({
                    error: ()=>{}
                }, config, value, breakpoint);
            }
            // build decls for each k/v
            const decls = [
                (0, _buildDecl.default)('--grid-gutter', value)
            ];
            // build a responsive rule with these decls
            const responsiveRule = _postcss.default.atRule({
                name: 'responsive',
                params: breakpoint
            });
            responsiveRule.source = src;
            responsiveRule.append(...decls);
            atRule.parent.append(responsiveRule);
        });
        atRule.remove();
        return;
    }
    if (params.indexOf('.') === -1) {
        throw atRule.error(`UNPACK: Can't unpack theme object. Supply a path: \`spacing.md\``, {
            word: 'unpack'
        });
    }
    if (parent.type === 'root') {
        throw atRule.error(`UNPACK: Cannot run from root`, {
            word: 'unpack'
        });
    }
    // get the wanted object
    const path = params.split('.');
    const obj = _lodash.default.get(config, path);
    if (!obj) {
        throw atRule.error(`UNPACK: iterable not found: \`${params}\``, {
            word: params
        });
    }
    if (typeof obj !== 'object') {
        throw atRule.error(`UNPACK: iterable must be an object of breakpoints \`${params}\``, {
            word: params
        });
    }
    // iterate through breakpoints
    _lodash.default.keys(obj).forEach((breakpoint)=>{
        let values = obj[breakpoint];
        // build decls for each k/v
        const decls = [];
        _lodash.default.keys(values).forEach((prop)=>{
            decls.push((0, _buildDecl.default)(prop, values[prop]));
        });
        // build a responsive rule with these decls
        const responsiveRule = _postcss.default.atRule({
            name: 'responsive',
            params: breakpoint
        });
        responsiveRule.source = src;
        responsiveRule.append(...decls);
        atRule.parent.append(responsiveRule);
    });
    atRule.remove();
}
