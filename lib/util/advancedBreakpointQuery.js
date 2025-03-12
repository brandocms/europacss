"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = advancedBreakpointQuery;
function advancedBreakpointQuery(bpQuery) {
  if (bpQuery.indexOf('>') > -1) {
    return true;
  }
  if (bpQuery.indexOf('<') > -1) {
    return true;
  }
  if (bpQuery.indexOf('$') > -1) {
    return true;
  }
  return false;
}