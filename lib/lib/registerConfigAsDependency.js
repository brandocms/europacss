"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, /**
 * Gives us reloading when editing config file!
 *
 * @param {*} configFile
 */ "default", {
    enumerable: true,
    get: function() {
        return _default;
    }
});
const _fs = /*#__PURE__*/ _interop_require_default(require("fs"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function _default(configFile) {
    if (!_fs.default.existsSync(configFile)) {
        throw new Error(`Specified EUROPA configuration file "${configFile}" doesn't exist.`);
    }
    return function(css, opts) {
        opts.messages.push({
            type: "dependency",
            file: configFile,
            parent: css.source.input.file
        });
    };
}
