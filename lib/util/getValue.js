"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getValue;
/**
 * Split `str` into value and unit. Returns value
 * @param {string} str
 */
function getValue(str) {
  const string = String(str);
  const val = parseFloat(string, 10);
  return val;
}