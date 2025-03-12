"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = multipleBreakpoints;
function multipleBreakpoints(bpQuery) {
  if (bpQuery.indexOf('/') > -1) {
    return true;
  }
  if (bpQuery.indexOf('$') > -1) {
    return true;
  }
  return false;
}