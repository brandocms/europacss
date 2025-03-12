"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = updateSource;
var _lodash = _interopRequireDefault(require("lodash"));
var _postcss = _interopRequireDefault(require("postcss"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function updateSource(nodes, source) {
  return _lodash.default.tap(Array.isArray(nodes) ? _postcss.default.root({
    nodes
  }) : nodes, tree => {
    tree.walk(node => node.source = source);
  });
}