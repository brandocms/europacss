"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = resolveConfigPath;
var _fs = _interopRequireDefault(require("fs"));
var _lodash = _interopRequireDefault(require("lodash"));
var _path = _interopRequireDefault(require("path"));
var _constants = require("../constants");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function resolveConfigPath(filePath) {
  if (_lodash.default.isObject(filePath)) {
    return undefined;
  }
  if (!_lodash.default.isUndefined(filePath)) {
    return _path.default.resolve(filePath);
  }
  for (const configFile of [_constants.defaultConfigFile, _constants.cjsConfigFile]) {
    try {
      const configPath = _path.default.resolve(configFile);
      _fs.default.accessSync(configPath);
      return configPath;
    } catch (err) {}
  }
}