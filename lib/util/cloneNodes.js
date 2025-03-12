"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = cloneNodes;
var _lodash = _interopRequireDefault(require("lodash"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function cloneNodes(nodes) {
  return _lodash.default.map(nodes, node => node.clone());
}