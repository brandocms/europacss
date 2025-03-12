"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return updateSource;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _postcss = /*#__PURE__*/ _interop_require_default(require("postcss"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function updateSource(nodes, source) {
    return _lodash.default.tap(Array.isArray(nodes) ? _postcss.default.root({
        nodes
    }) : nodes, (tree)=>{
        tree.walk((node)=>node.source = source);
    });
}
