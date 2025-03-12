"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = splitUnit;
/**
 * Split `str` into value and unit. Returns array
 * @param {string} str
 */
function splitUnit(str) {
  if (!str) {
    return [-9999, 'px'];
  }
  const string = String(str);
  const val = parseFloat(string, 10);
  const unit = string.match(/[\d.\-+]*\s*(.*)/)[1] || '';
  return [val, unit];
}