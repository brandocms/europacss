"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = renderCalcTypographyPadding;
var _reduceCssCalc = _interopRequireDefault(require("reduce-css-calc"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function renderCalcTypographyPadding(val, {
  typography: {
    paddingDivider
  }
}) {
  // TODO: should paddingDivider be a map of breakpoints? Different divider values per breakpoint?
  return (0, _reduceCssCalc.default)(`calc(100% * ${val} / ${paddingDivider})`, 10);
}