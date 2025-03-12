"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return parseFontSizeQuery;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _splitUnit = /*#__PURE__*/ _interop_require_default(require("./splitUnit"));
const _parseRFSQuery = /*#__PURE__*/ _interop_require_default(require("./parseRFSQuery"));
const _parseVWQuery = /*#__PURE__*/ _interop_require_default(require("./parseVWQuery"));
const _replaceWildcards = /*#__PURE__*/ _interop_require_default(require("./replaceWildcards"));
const _calcMaxFromBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromBreakpoint"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function parseFontSizeQuery(node, config, fontSizeQuery, breakpoint) {
    let lineHeight;
    let modifier;
    let renderedFontSize;
    if (fontSizeQuery.indexOf("/") !== -1) {
        [fontSizeQuery, lineHeight] = fontSizeQuery.split("/");
    }
    if (fontSizeQuery.indexOf("between(") === -1) {
        if (fontSizeQuery.indexOf("(") !== -1) {
            // we have a modifier xs(1.6) --> multiplies the size with 1.6
            modifier = fontSizeQuery.match(/\((.*)\)/)[1];
            fontSizeQuery = fontSizeQuery.split("(")[0];
        }
    }
    const themePath = [
        "theme",
        "typography",
        "sizes"
    ];
    const fontSize = fontSizeQuery;
    const path = fontSize.split(".");
    let resolvedFontsize = _lodash.default.get(config, themePath.concat(path));
    if (!resolvedFontsize) {
        resolvedFontsize = fontSize;
    }
    if (!_lodash.default.isString(resolvedFontsize)) {
        resolvedFontsize = (0, _replaceWildcards.default)(resolvedFontsize, config);
        if (!_lodash.default.has(resolvedFontsize, breakpoint)) {
            throw node.error(`FONTSIZE: No breakpoint \`${breakpoint}\` found in theme.typography.sizes.${fontSize}`, {
                name: breakpoint
            });
        }
    } else {
        if (resolvedFontsize.indexOf("between(") !== -1) {
            // responsive font size
            return (0, _parseRFSQuery.default)(node, config, resolvedFontsize, lineHeight, breakpoint);
        }
    }
    if (!modifier) {
        if (_lodash.default.isString(resolvedFontsize)) {
            if (!lineHeight && resolvedFontsize.indexOf("/") !== -1) {
                [resolvedFontsize, lineHeight] = resolvedFontsize.split("/");
            }
            if (resolvedFontsize.endsWith("vw")) {
                if (lineHeight && lineHeight.endsWith("vw")) {
                    return (0, _parseVWQuery.default)(node, config, resolvedFontsize, lineHeight, breakpoint, false);
                } else {
                    return {
                        ...{
                            "font-size": (0, _parseVWQuery.default)(node, config, resolvedFontsize, lineHeight, breakpoint, true)
                        },
                        ...lineHeight && {
                            "line-height": lineHeight
                        }
                    };
                }
            } else if (resolvedFontsize.endsWith("dpx")) {
                const [fs, _fsUnit] = (0, _splitUnit.default)(resolvedFontsize);
                const [bpPx, _bpUnit] = (0, _splitUnit.default)(config.theme.breakpoints[breakpoint]);
                const fsVw = (fs / bpPx * 100).toFixed(5);
                if (lineHeight && lineHeight.endsWith("dpx")) {
                    const [lh, _fsUnit] = (0, _splitUnit.default)(lineHeight);
                    const lhVw = (lh / bpPx * 100).toFixed(5);
                    return (0, _parseVWQuery.default)(node, config, `${fsVw}vw`, `${lhVw}vw`, breakpoint, false);
                } else {
                    return {
                        ...{
                            "font-size": (0, _parseVWQuery.default)(node, config, `${fsVw}vw`, lineHeight, breakpoint, true)
                        },
                        ...lineHeight && {
                            "line-height": lineHeight
                        }
                    };
                }
            } else {
                return {
                    ...{
                        "font-size": resolvedFontsize
                    },
                    ...lineHeight && {
                        "line-height": lineHeight
                    }
                };
            }
        }
        let bpFS = resolvedFontsize[breakpoint];
        if (_lodash.default.isObject(bpFS)) {
            const props = {};
            _lodash.default.keys(bpFS).forEach((key)=>{
                const v = bpFS[key];
                if (v.endsWith("vw")) {
                    props[key] = (0, _parseVWQuery.default)(node, config, v, lineHeight, breakpoint, true);
                } else if (v.endsWith("dpx")) {
                    const [fs, _fsUnit] = (0, _splitUnit.default)(v);
                    const [bpPx, _bpUnit] = (0, _splitUnit.default)(config.theme.breakpoints[breakpoint]);
                    const fsVw = (fs / bpPx * 100).toFixed(5);
                    props[key] = (0, _parseVWQuery.default)(node, config, `${fsVw}vw`, lineHeight, breakpoint, true);
                } else {
                    props[key] = v;
                }
            });
            return props;
        } else {
            if (!lineHeight && bpFS.indexOf("/") !== -1) {
                [bpFS, lineHeight] = bpFS.split("/");
            }
            if (bpFS.indexOf("between(") !== -1) {
                // responsive font size
                return (0, _parseRFSQuery.default)(node, config, bpFS, lineHeight, breakpoint);
            }
            if (bpFS.endsWith("vw")) {
                if (lineHeight && lineHeight.endsWith("vw")) {
                    return (0, _parseVWQuery.default)(node, config, bpFS, lineHeight, breakpoint, false);
                } else {
                    return {
                        ...{
                            "font-size": (0, _parseVWQuery.default)(node, config, bpFS, lineHeight, breakpoint, true)
                        },
                        ...lineHeight && {
                            "line-height": lineHeight
                        }
                    };
                }
            }
            if (bpFS.endsWith("dpx")) {
                if (lineHeight && lineHeight.endsWith("vw")) {
                    throw node.error(`FONTSIZE: Mixing dpx and vw is not allowed with fontsize and lineheight`, {
                        name: breakpoint
                    });
                }
                const [fs, _fsUnit] = (0, _splitUnit.default)(bpFS);
                let [bpPx, _bpUnit] = (0, _splitUnit.default)(config.theme.breakpoints[breakpoint]);
                if (bpPx === 0) {
                    [bpPx, _bpUnit] = (0, _splitUnit.default)((0, _calcMaxFromBreakpoint.default)(config.theme.breakpoints, breakpoint));
                }
                const fsVw = (fs / bpPx * 100).toFixed(5);
                if (lineHeight && lineHeight.endsWith("dpx")) {
                    const [lh, _fsUnit] = (0, _splitUnit.default)(lineHeight);
                    const lhVw = (lh / bpPx * 100).toFixed(5);
                    return (0, _parseVWQuery.default)(node, config, `${fsVw}vw`, `${lhVw}vw`, breakpoint, false);
                }
                return {
                    ...{
                        "font-size": (0, _parseVWQuery.default)(node, config, `${fsVw}vw`, lineHeight, breakpoint, true)
                    },
                    ...lineHeight && {
                        "line-height": lineHeight
                    }
                };
            }
            return {
                ...{
                    "font-size": bpFS
                },
                ...lineHeight && {
                    "line-height": lineHeight
                }
            };
        }
    } else {
        let fs;
        if (_lodash.default.isString(resolvedFontsize)) {
            fs = resolvedFontsize;
        } else if (_lodash.default.isObject(resolvedFontsize[breakpoint])) {
            fs = resolvedFontsize[breakpoint]["font-size"];
        } else {
            fs = resolvedFontsize[breakpoint];
        }
        const [val, unit] = (0, _splitUnit.default)(fs);
        renderedFontSize = `${val * modifier}${unit}`;
        return {
            ...{
                "font-size": renderedFontSize
            },
            ...lineHeight && {
                "line-height": lineHeight
            }
        };
    }
}
