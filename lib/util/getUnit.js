"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = getUnit;
function getUnit(value) {
  const match = value.match(/px|rem|em|vw/);
  if (match) {
    return match.toString();
  }
  return null;
}