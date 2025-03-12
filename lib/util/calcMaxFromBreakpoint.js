"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = calcMaxFromBreakpoint;
function calcMaxFromBreakpoint(breakpoints, bpKey) {
  const keys = Object.keys(breakpoints);
  const idx = keys.indexOf(bpKey);
  if (idx < keys.length - 1) {
    const nextKey = keys[idx + 1];
    return `${parseInt(breakpoints[nextKey].replace('px', '')) - 1}px`;
  }
  return null;
}