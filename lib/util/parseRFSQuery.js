"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return parseRFSQuery;
    }
});
const _parseRFS = /*#__PURE__*/ _interop_require_default(require("./parseRFS"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function parseRFSQuery(node, config, fontSizeQuery, lineHeight, breakpoint) {
    fontSizeQuery = fontSizeQuery.match(/between\((.*)\)/)[1];
    const fontSize = fontSizeQuery;
    const renderedFontSize = (0, _parseRFS.default)(node, config, fontSize, breakpoint);
    return {
        ...{
            'font-size': renderedFontSize
        },
        ...lineHeight && {
            'line-height': lineHeight
        }
    };
}
