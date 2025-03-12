"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return _default;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcssfunctions = /*#__PURE__*/ _interop_require_default(require("postcss-functions"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _default(getConfig) {
    return (0, _postcssfunctions.default)({
        functions: {
            theme: (path, ...defaultValue)=>{
                const config = getConfig();
                return _lodash.default.thru(_lodash.default.get(config.theme, _lodash.default.trim(path, `'"`), defaultValue), (value)=>{
                    return Array.isArray(value) ? value.join(", ") : value;
                });
            }
        }
    });
}
