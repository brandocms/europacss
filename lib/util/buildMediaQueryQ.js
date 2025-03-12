"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, // for single breakpoints, use buildSpecificMediaQuery
"default", {
    enumerable: true,
    get: function() {
        return buildMediaQueryQ;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _parseQ = /*#__PURE__*/ _interop_require_default(require("./parseQ"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function buildMediaQueryQ({ breakpoints , breakpointCollections  }, q) {
    const queryStrings = (0, _parseQ.default)({
        breakpoints,
        breakpointCollections
    }, q);
    return (0, _lodash.default)(queryStrings).map((screen)=>{
        return (0, _lodash.default)(screen).map((value, feature)=>{
            feature = _lodash.default.get({
                min: "min-width",
                max: "max-width"
            }, feature, feature);
            return `(${feature}: ${value})`;
        }).join(" and ");
    }).join(", ");
}
