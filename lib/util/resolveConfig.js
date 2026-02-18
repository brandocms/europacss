"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, /**
 * Resolve configuration by merging configs and resolving function values
 * @param {Array} configs - Array of configuration objects
 * @returns {Object} Resolved configuration
 */ "default", {
    enumerable: true,
    get: function() {
        return resolveConfig;
    }
});
const _mergeWith = /*#__PURE__*/ _interop_require_default(require("lodash/mergeWith"));
const _isFunction = /*#__PURE__*/ _interop_require_default(require("lodash/isFunction"));
const _defaults = /*#__PURE__*/ _interop_require_default(require("lodash/defaults"));
const _map = /*#__PURE__*/ _interop_require_default(require("lodash/map"));
const _toPath = /*#__PURE__*/ _interop_require_default(require("lodash/toPath"));
const _resolveTokenReferences = /*#__PURE__*/ _interop_require_default(require("./resolveTokenReferences"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
/**
 * Configuration utility functions available to theme resolvers
 */ const configUtils = {
    /**
   * Create negative versions of a scale
   * @param {Object} scale - Scale object with values
   * @returns {Object} New object with negative versions of values
   */ negative (scale) {
        return Object.keys(scale).filter((key)=>scale[key] !== '0').reduce((negativeScale, key)=>({
                ...negativeScale,
                [`-${key}`]: `-${scale[key]}`
            }), {});
    }
};
/**
 * Resolve a value or function with provided arguments
 * @param {*} valueToResolve - Value or function to resolve
 * @param  {...any} args - Arguments to pass to function
 * @returns {*} Resolved value
 */ function value(valueToResolve, ...args) {
    return (0, _isFunction.default)(valueToResolve) ? valueToResolve(...args) : valueToResolve;
}
/**
 * Merge theme extensions with base theme
 * @param {Object} theme - Theme object with possible extend property
 * @returns {Object} Merged theme
 */ function mergeExtensions({ extend, ...theme }) {
    return (0, _mergeWith.default)(theme, extend, (themeValue, extensions)=>{
        // If both are not functions, merge objects normally
        if (!(0, _isFunction.default)(themeValue) && !(0, _isFunction.default)(extensions)) {
            return {
                ...themeValue,
                ...extensions
            };
        }
        // If one or both are functions, return a new function that merges the results
        return (resolveThemePath, utils)=>({
                ...value(themeValue, resolveThemePath, utils),
                ...value(extensions, resolveThemePath, utils)
            });
    });
}
/**
 * Resolve all function values in an object with a theme path resolver
 * @param {Object} object - Object with possible function values
 * @returns {Object} Object with resolved values
 */ function resolveFunctionKeys(object) {
    /**
   * Internal function to resolve a theme path to a value
   * @param {String} key - Theme path key
   * @param {*} defaultValue - Default value if path not found
   * @returns {*} Resolved value
   */ const resolveThemePath = (key, defaultValue)=>{
        const path = (0, _toPath.default)(key);
        let index = 0;
        let val = object;
        // Navigate down the path
        while(val !== undefined && val !== null && index < path.length){
            val = val[path[index++]];
            // Resolve if value is a function
            val = (0, _isFunction.default)(val) ? val(resolveThemePath) : val;
        }
        return val === undefined ? defaultValue : val;
    };
    // Process all top-level keys
    return Object.keys(object).reduce((resolved, key)=>{
        return {
            ...resolved,
            [key]: (0, _isFunction.default)(object[key]) ? object[key](resolveThemePath, configUtils) : object[key]
        };
    }, {});
}
function resolveConfig(configs) {
    // Extract and process all theme configs
    const mergedTheme = (0, _defaults.default)({}, ...(0, _map.default)(configs, 'theme'));
    // Resolve extensions, function values, and token references in the theme
    const resolvedTheme = (0, _resolveTokenReferences.default)(resolveFunctionKeys(mergeExtensions(mergedTheme)));
    // Merge resolved theme with other config properties
    return (0, _defaults.default)({
        theme: resolvedTheme
    }, ...configs);
}
