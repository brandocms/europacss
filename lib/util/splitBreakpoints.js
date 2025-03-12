"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = splitBreakpoints;
function splitBreakpoints(bpQuery) {
  if (bpQuery.indexOf('/') > -1) {
    return bpQuery.split('/');
  }
  return [bpQuery];
}