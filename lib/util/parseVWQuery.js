"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return parseVWQuery;
    }
});
const _splitUnit = /*#__PURE__*/ _interop_require_default(require("./splitUnit"));
const _isLargestBreakpoint = /*#__PURE__*/ _interop_require_default(require("./isLargestBreakpoint"));
const _getLargestContainer = /*#__PURE__*/ _interop_require_default(require("./getLargestContainer"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function parseVWQuery(node, config, fontSizeQuery, lineHeight, breakpoint, onlyFontsize) {
    let renderedFontSize;
    let renderedLineHeight;
    if (config.hasOwnProperty("setMaxForVw") && config.setMaxForVw === true) {
        if ((0, _isLargestBreakpoint.default)(config, breakpoint)) {
            const maxSize = (0, _getLargestContainer.default)(config);
            const [valMax, unitMax] = (0, _splitUnit.default)(maxSize);
            if (unitMax === "%") {
                throw node.error(`SPACING: When setMaxForVw is true, the container max cannot be % based.`);
            }
            const [valVw] = (0, _splitUnit.default)(fontSizeQuery);
            renderedFontSize = `${valMax / 100 * valVw}${unitMax}`;
            if (!onlyFontsize && lineHeight && lineHeight.endsWith("vw")) {
                const [lineHeightVw] = (0, _splitUnit.default)(lineHeight);
                renderedLineHeight = `${valMax / 100 * lineHeightVw}${unitMax}`;
            }
        } else {
            if (!onlyFontsize && lineHeight && lineHeight.endsWith("vw")) {
                renderedLineHeight = `calc(${lineHeight} * var(--ec-zoom))`;
            }
            renderedFontSize = `calc(${fontSizeQuery} * var(--ec-zoom))`;
        }
    } else {
        if (!onlyFontsize && lineHeight && lineHeight.endsWith("vw")) {
            renderedLineHeight = `calc(${lineHeight} * var(--ec-zoom))`;
        }
        renderedFontSize = `calc(${fontSizeQuery} * var(--ec-zoom))`;
    }
    if (onlyFontsize) {
        return renderedFontSize;
    }
    return {
        ...{
            "font-size": renderedFontSize
        },
        ...renderedLineHeight && {
            "line-height": renderedLineHeight
        }
    };
}
