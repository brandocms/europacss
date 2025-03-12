"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;
var _lodash = _interopRequireDefault(require("lodash"));
var _postcssFunctions = _interopRequireDefault(require("postcss-functions"));
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _default(getConfig) {
  return (0, _postcssFunctions.default)({
    functions: {
      theme: (path, ...defaultValue) => {
        const config = getConfig();
        return _lodash.default.thru(_lodash.default.get(config.theme, _lodash.default.trim(path, `'"`), defaultValue), value => {
          return Array.isArray(value) ? value.join(', ') : value;
        });
      }
    }
  });
}