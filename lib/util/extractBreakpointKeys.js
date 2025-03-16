"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, /**
 * Extract breakpoint keys from a query string
 * @param {Object} config - Configuration object
 * @param {Object} config.breakpoints - Breakpoint definitions
 * @param {Object} config.breakpointCollections - Collections of breakpoints
 * @param {String} q - Query string
 * @returns {Array} - Array of breakpoint keys
 */ "default", {
    enumerable: true,
    get: function() {
        return extractBreakpointKeys;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function extractBreakpointKeys({ breakpoints , breakpointCollections  }, q) {
    const firstChar = q[0];
    const secondChar = q[1];
    const keys = _lodash.default.keys(breakpoints);
    // Handle breakpoint collection ($collection)
    if (firstChar === "$") {
        return processBreakpointCollection({
            breakpoints,
            breakpointCollections
        }, q);
    }
    // Handle less-than queries (< or <=)
    if (firstChar === "<") {
        return processLessThanQuery(keys, q, secondChar);
    }
    // Handle greater-than queries (> or >=)
    if (firstChar === ">") {
        return processGreaterThanQuery(keys, q, secondChar);
    }
    // Handle equals queries (=)
    if (firstChar === "=") {
        throw new Error("extractBreakpointKeys: Mediaqueries should never start with =");
    }
    // Default: Split by forward slash
    return q.split("/");
}
/**
 * Process a breakpoint collection reference
 * @param {Object} config - Configuration object
 * @param {String} key - Collection key
 * @returns {Array} - Array of breakpoint keys
 */ function processBreakpointCollection({ breakpoints , breakpointCollections  }, key) {
    if (!breakpointCollections) {
        throw new Error(`extractBreakpointKeys: No \`breakpointCollection\` set in config, but \`${key}\` was referenced`);
    }
    const resolvedBreakpointQ = breakpointCollections[key];
    if (!resolvedBreakpointQ) {
        throw new Error(`extractBreakpointKeys: Breakpoint collection \`${key}\` not found!`);
    }
    return extractBreakpointKeys({
        breakpoints,
        breakpointCollections
    }, resolvedBreakpointQ);
}
/**
 * Process a less-than query (< or <=)
 * @param {Array} keys - Array of breakpoint keys
 * @param {String} q - Query string
 * @param {String} secondChar - Second character of query string
 * @returns {Array} - Array of breakpoint keys
 */ function processLessThanQuery(keys, q, secondChar) {
    const bps = [];
    let key, idx;
    if (secondChar === "=") {
        // <= (less than or equal to)
        key = q.substring(2);
        idx = keys.indexOf(key);
        if (idx === -1) {
            throw new Error(`extractBreakpointKeys: Breakpoint \`${key}\` not found!`);
        }
        // Include this breakpoint and all smaller ones
        for(let i = idx; i >= 0; i--){
            bps.unshift(keys[i]);
        }
    } else {
        // < (less than)
        key = q.substring(1);
        idx = keys.indexOf(key);
        if (idx === -1) {
            throw new Error(`extractBreakpointKeys: Breakpoint \`${key}\` not found!`);
        }
        // Include all breakpoints smaller than this one
        for(let i = idx - 1; i >= 0; i--){
            bps.unshift(keys[i]);
        }
    }
    return bps;
}
/**
 * Process a greater-than query (> or >=)
 * @param {Array} keys - Array of breakpoint keys
 * @param {String} q - Query string
 * @param {String} secondChar - Second character of query string
 * @returns {Array} - Array of breakpoint keys
 */ function processGreaterThanQuery(keys, q, secondChar) {
    const bps = [];
    let key, idx;
    if (secondChar === "=") {
        // >= (greater than or equal to)
        key = q.substring(2);
        idx = keys.indexOf(key);
        if (idx === -1) {
            throw new Error(`extractBreakpointKeys: Breakpoint \`${key}\` not found!`);
        }
        // Include this breakpoint and all larger ones
        for(let i = idx; i < keys.length; i++){
            bps.push(keys[i]);
        }
    } else {
        // > (greater than)
        key = q.substring(1);
        idx = keys.indexOf(key);
        if (idx === -1) {
            throw new Error(`extractBreakpointKeys: Breakpoint \`${key}\` not found!`);
        }
        // Include all breakpoints larger than this one
        for(let i = idx + 1; i < keys.length; i++){
            bps.push(keys[i]);
        }
    }
    return bps;
}
