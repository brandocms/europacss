"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return parseQ;
    }
});
const _calcMaxFromBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromBreakpoint"));
const _calcMaxFromPreviousBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromPreviousBreakpoint"));
const _calcMaxFromNextBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromNextBreakpoint"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function parseQ({ breakpoints , breakpointCollections  }, q) {
    if (!Array.isArray(q)) {
        // could be a split query xs/sm/xl
        q = q.split("/");
    }
    return q.map((query)=>processQ({
            breakpoints,
            breakpointCollections
        }, query)).flat();
}
function processQ({ breakpoints , breakpointCollections  }, q) {
    switch(q[0]){
        case "=":
            throw new Error("parseQ: Mediaqueries should not start with =");
        case "$":
            {
                const key = q;
                if (!breakpointCollections) {
                    throw new Error(`parseQ: No \`breakpointCollection\` set in config, but \`${key}\` was referenced`);
                }
                const resolvedBreakpointQ = breakpointCollections[key];
                if (!resolvedBreakpointQ) {
                    throw new Error(`parseQ: Breakpoint collection \`${key}\` not found!`);
                }
                return parseQ({
                    breakpoints,
                    breakpointCollections
                }, resolvedBreakpointQ);
            }
        case "<":
            if (q[1] === "=") {
                const key = q.substring(2);
                const min = "0";
                const max = (0, _calcMaxFromBreakpoint.default)(breakpoints, key);
                return {
                    min,
                    ...max && {
                        max
                    }
                };
            } else {
                const key = q.substring(1);
                const min = "0";
                const max = (0, _calcMaxFromPreviousBreakpoint.default)(breakpoints, key);
                return {
                    min,
                    ...max && {
                        max
                    }
                };
            }
        case ">":
            if (q[1] === "=") {
                const key = q.substring(2);
                return {
                    min: breakpoints[key]
                };
            } else {
                const key = q.substring(1);
                return {
                    min: (0, _calcMaxFromNextBreakpoint.default)(breakpoints, key)
                };
            }
        default:
            {
                const key = q;
                const min = breakpoints[key];
                const max = (0, _calcMaxFromBreakpoint.default)(breakpoints, key);
                return {
                    min,
                    ...max && {
                        max
                    }
                };
            }
    }
}
