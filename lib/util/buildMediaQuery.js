"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = buildMediaQuery;
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// builds with MIN only. Fine for when iterating through all breakpoints
// for single breakpoints, use buildSpecificMediaQuery

function buildMediaQuery(breakpoints, breakpoint) {
  let screens = breakpoints[breakpoint];
  if (_lodash.default.isString(screens)) {
    screens = {
      min: screens
    };
  }
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