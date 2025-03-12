"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return resolveConfigPath;
    }
});
const _fs = /*#__PURE__*/ _interop_require_default(require("fs"));
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _path = /*#__PURE__*/ _interop_require_default(require("path"));
const _constants = require("../constants");
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function resolveConfigPath(filePath) {
    if (_lodash.default.isObject(filePath)) {
        return undefined;
    }
    if (!_lodash.default.isUndefined(filePath)) {
        return _path.default.resolve(filePath);
    }
    for (const configFile of [
        _constants.defaultConfigFile,
        _constants.cjsConfigFile
    ]){
        try {
            const configPath = _path.default.resolve(configFile);
            _fs.default.accessSync(configPath);
            return configPath;
        } catch (err) {}
    }
}
