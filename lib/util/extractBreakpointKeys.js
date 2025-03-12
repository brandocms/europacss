"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = extractBreakpointKeys;
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function extractBreakpointKeys({
  breakpoints,
  breakpointCollections
}, q) {
  const bps = [];
  const keys = _lodash.default.keys(breakpoints);
  switch (q[0]) {
    case '=':
      throw new Error('extractBreakpointKeys: Mediaqueries should never start with =');
    case '$':
      {
        const key = q;
        if (!breakpointCollections) {
          throw new Error(`extractBreakpointKeys: No \`breakpointCollection\` set in config, but \`${key}\` was referenced`);
        }
        const resolvedBreakpointQ = breakpointCollections[key];
        if (!resolvedBreakpointQ) {
          throw new Error(`extractBreakpointKeys: Breakpoint collection \`${key}\` not found!`);
        }
        return extractBreakpointKeys({
          breakpoints,
          breakpointCollections
        }, resolvedBreakpointQ);
      }
    case '<':
      if (q[1] === '=') {
        const key = q.substring(2);
        const idx = keys.indexOf(key);
        for (let i = idx; i >= 0; i--) {
          bps.unshift(keys[i]);
        }
      } else {
        const key = q.substring(1);
        const idx = keys.indexOf(key);
        for (let i = idx - 1; i >= 0; i--) {
          bps.unshift(keys[i]);
        }
      }
      break;
    case '>':
      if (q[1] === '=') {
        const key = q.substring(2);
        const idx = keys.indexOf(key);
        for (let i = idx; i < keys.length; i++) {
          bps.push(keys[i]);
        }
      } else {
        const key = q.substring(1);
        const idx = keys.indexOf(key);
        for (let i = idx + 1; i < keys.length; i++) {
          bps.push(keys[i]);
        }
      }
      break;
    default:
      return q.split('/');
  }
  return bps;
}