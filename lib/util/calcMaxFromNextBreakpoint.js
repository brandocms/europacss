"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = calcMaxFromNextBreakpoint;
var _calcMaxFromBreakpoint = _interopRequireDefault(require("./calcMaxFromBreakpoint"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function calcMaxFromNextBreakpoint(breakpoints, bpKey) {
  const keys = Object.keys(breakpoints);
  const idx = keys.indexOf(bpKey);
  if (idx <= keys.length - 1) {
    const nextKey = keys[idx + 1];
    return breakpoints[nextKey];
  }
  return (0, _calcMaxFromBreakpoint.default)(breakpoints, bpKey);
}