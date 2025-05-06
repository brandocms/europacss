"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return buildDecl;
    }
});
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
const _parseSize = /*#__PURE__*/ _interop_require_default(require("./parseSize"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function buildDecl(p, value, important = false, config, bp) {
    const props = [];
    switch(p){
        case 'margin-x':
            props.push({
                prop: 'margin-left',
                value: value
            });
            props.push({
                prop: 'margin-right',
                value: value
            });
            break;
        case 'margin-y':
            props.push({
                prop: 'margin-top',
                value: value
            });
            props.push({
                prop: 'margin-bottom',
                value: value
            });
            break;
        case 'margin':
            props.push({
                prop: 'margin',
                value: value
            });
            break;
        case 'padding-x':
            props.push({
                prop: 'padding-left',
                value: value
            });
            props.push({
                prop: 'padding-right',
                value: value
            });
            break;
        case 'padding-y':
            props.push({
                prop: 'padding-top',
                value: value
            });
            props.push({
                prop: 'padding-bottom',
                value: value
            });
            break;
        case 'padding':
            props.push({
                prop: 'padding',
                value: value
            });
            break;
        case 'translateX':
            props.push({
                prop: 'transform',
                value: `translateX(${value})`
            });
            break;
        case 'translateY':
            props.push({
                prop: 'transform',
                value: `translateY(${value})`
            });
            break;
        case 'translateZ':
            props.push({
                prop: 'transform',
                value: `translateZ(${value})`
            });
            break;
        case 'scale':
            props.push({
                prop: 'transform',
                value: `scale(${value})`
            });
            break;
        case 'abs100':
            props.push({
                prop: 'position',
                value: 'absolute'
            });
            props.push({
                prop: 'width',
                value: '100%'
            });
            props.push({
                prop: 'height',
                value: '100%'
            });
            props.push({
                prop: 'top',
                value: '0'
            });
            props.push({
                prop: 'left',
                value: '0'
            });
            break;
        case 'container':
            // Process the container padding value, handling dpx units if present
            let rawPaddingValue = config.theme.container.padding[bp];
            let paddingValue = (0, _parseSize.default)({
                error: ()=>{}
            }, config, rawPaddingValue, bp);
            const maxWidth = config.theme.container.maxWidth[bp];
            props.push({
                prop: 'padding-left',
                value: paddingValue
            });
            props.push({
                prop: 'padding-right',
                value: paddingValue
            });
            props.push({
                prop: 'max-width',
                value: maxWidth
            });
            props.push({
                prop: 'margin-left',
                value: 'auto'
            });
            props.push({
                prop: 'margin-right',
                value: 'auto'
            });
            props.push({
                prop: 'width',
                value: '100%'
            });
            break;
        default:
            props.push({
                prop: p,
                value: value
            });
    }
    return props.map(({ prop, value })=>_postcss.default.decl({
            prop,
            value,
            important
        }));
}
