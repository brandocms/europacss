"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = renderCalcWithRounder;
var _reduceCssCalc = _interopRequireDefault(require("reduce-css-calc"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function renderCalcWithRounder(val) {
  return (0, _reduceCssCalc.default)(`calc(100% * ${val})`, 6);
}