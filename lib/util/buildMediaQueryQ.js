"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = buildMediaQueryQ;
var _lodash = _interopRequireDefault(require("lodash"));
var _parseQ = _interopRequireDefault(require("./parseQ"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
// for single breakpoints, use buildSpecificMediaQuery

function buildMediaQueryQ({
  breakpoints,
  breakpointCollections
}, q) {
  const queryStrings = (0, _parseQ.default)({
    breakpoints,
    breakpointCollections
  }, q);
  return (0, _lodash.default)(queryStrings).map(screen => {
    return (0, _lodash.default)(screen).map((value, feature) => {
      feature = _lodash.default.get({
        min: 'min-width',
        max: 'max-width'
      }, feature, feature);
      return `(${feature}: ${value})`;
    }).join(' and ');
  }).join(', ');
}