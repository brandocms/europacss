"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = buildFullMediaQuery;
var _lodash = _interopRequireDefault(require("lodash"));
var _calcMaxFromBreakpoint = _interopRequireDefault(require("./calcMaxFromBreakpoint"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// builds with MIN AND MAX

function buildFullMediaQuery(breakpoints, breakpoint) {
  const min = breakpoints[breakpoint];
  const max = (0, _calcMaxFromBreakpoint.default)(breakpoints, breakpoint);
  let screens = {
    min,
    ...(max && {
      max
    })
  };
  if (!Array.isArray(screens)) {
    screens = [screens];
  }
  return (0, _lodash.default)(screens).map(screen => {
    return (0, _lodash.default)(screen).map((value, feature) => {
      feature = _lodash.default.get({
        min: 'min-width',
        max: 'max-width'
      }, feature, feature);
      return `(${feature}: ${value})`;
    }).join(' and ');
  }).join(', ');
}