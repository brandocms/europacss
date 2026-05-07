"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, /**
 * Resolve a config key that may use dot or slash notation for hierarchy access.
 * Tries dot notation first, then slash notation as fallback.
 *
 * @param {object} config - The full config object
 * @param {string[]} basePath - Base path array (e.g. ['theme', 'colors'])
 * @param {string} key - The key to resolve (e.g. 'red.100' or 'red/100')
 * @returns {*} The resolved value, or undefined if not found
 */ "default", {
    enumerable: true,
    get: function() {
        return resolveConfigKey;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function resolveConfigKey(config, basePath, key) {
    // Try dot notation
    const dotResult = _lodash.default.get(config, basePath.concat(key.split('.')));
    if (dotResult !== undefined) {
        return dotResult;
    }
    // Try slash notation if it contains slashes
    if (key.includes('/')) {
        const slashResult = _lodash.default.get(config, basePath.concat(key.split('/')));
        if (slashResult !== undefined) {
            return slashResult;
        }
    }
    return undefined;
}
