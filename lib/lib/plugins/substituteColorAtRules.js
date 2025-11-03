"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _buildDecl = /*#__PURE__*/ _interop_require_default(require("../../util/buildDecl"));
const _buildMediaQueryQ = /*#__PURE__*/ _interop_require_default(require("../../util/buildMediaQueryQ"));
const _findResponsiveParent = /*#__PURE__*/ _interop_require_default(require("../../util/findResponsiveParent"));
const _extractBreakpointKeys = /*#__PURE__*/ _interop_require_default(require("../../util/extractBreakpointKeys"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
module.exports = (getConfig)=>{
    const config = getConfig();
    return {
        postcssPlugin: 'europacss-color',
        prepare () {
            return {
                AtRule: {
                    color: (atRule)=>{
                        processRule(atRule, config, false);
                    },
                    'color!': (atRule)=>{
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
    const { theme: { breakpoints, breakpointCollections } } = config;
    // Parse the rule parameters: target, color, and optional breakpoint query
    let [target, color, bpQuery] = _postcss.default.list.space(atRule.params);
    if (!target || !color) {
        throw atRule.error(`COLOR: Must include target (fg/bg) and color property`, {
            word: 'color'
        });
    }
    // Clone rule to preserve original for media query creation
    const clonedRule = atRule.clone();
    // Check if we're nested under a @responsive rule
    const responsiveParent = (0, _findResponsiveParent.default)(atRule);
    if (responsiveParent) {
        // Under @responsive, we can't have a breakpoint query in @color
        if (bpQuery) {
            throw clonedRule.error(`COLOR: @color cannot be nested under @responsive and have a breakpoint query.`, {
                name: bpQuery
            });
        }
    }
    const src = atRule.source;
    // Helper function to create color declaration
    function createColorDecl(target, color, flagAsImportant) {
        // Get the wanted object
        const theme = [
            'theme',
            'colors'
        ];
        const path = color.split('.');
        const resolvedColor = _lodash.default.get(config, theme.concat(path));
        let decl;
        switch(target){
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
        return decl;
    }
    if (bpQuery) {
        // We have a breakpoint query, extract all affected breakpoints
        const affectedBreakpoints = (0, _extractBreakpointKeys.default)({
            breakpoints,
            breakpointCollections
        }, bpQuery);
        // For each breakpoint, create a media query with the color declaration
        _lodash.default.each(affectedBreakpoints, (bp)=>{
            // Create the color declaration
            const colorDecl = createColorDecl(target, color, flagAsImportant);
            // Create a rule with the parent's selector
            const rule = _postcss.default.rule({
                selector: parent.selector
            });
            rule.append(colorDecl);
            // Create media query at-rule
            const mediaRule = _postcss.default.atRule({
                name: 'media',
                params: (0, _buildMediaQueryQ.default)({
                    breakpoints,
                    breakpointCollections
                }, bp),
                source: src
            });
            // Add the rule to the media query
            mediaRule.append(rule);
            // Insert after the parent rule (at root level)
            parent.after(mediaRule);
        });
    } else {
        // No breakpoint query specified, add directly to parent
        const colorDecl = createColorDecl(target, color, flagAsImportant);
        parent.append(colorDecl);
    }
    // Remove the original @color rule
    atRule.remove();
    // Remove parent if it's now empty
    if (parent && !parent.nodes.length) {
        parent.remove();
    }
}
