"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, /**
 * Parse query strings into media query constraints
 * @param {Object} config - Configuration object
 * @param {Object} config.breakpoints - Breakpoint definitions
 * @param {Object} config.breakpointCollections - Collections of breakpoints
 * @param {Array|String} q - Query string or array of query strings
 * @returns {Array} Array of min/max constraints
 */ "default", {
    enumerable: true,
    get: function() {
        return parseQ;
    }
});
const _calcMaxFromBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromBreakpoint"));
const _calcMaxFromPreviousBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromPreviousBreakpoint"));
const _calcMaxFromNextBreakpoint = /*#__PURE__*/ _interop_require_default(require("./calcMaxFromNextBreakpoint"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function parseQ({ breakpoints, breakpointCollections }, q) {
    // Convert string queries to array if needed
    if (!Array.isArray(q)) {
        // Handle split queries like 'xs/sm/xl'
        q = q.split('/');
    }
    // Process each query and flatten the results
    return q.map((query)=>processQ({
            breakpoints,
            breakpointCollections
        }, query)).flat();
}
/**
 * Process a single query string
 * @param {Object} config - Configuration object
 * @param {Object} config.breakpoints - Breakpoint definitions
 * @param {Object} config.breakpointCollections - Collections of breakpoints
 * @param {String} q - Query string
 * @returns {Object|Array} Media query constraints
 */ function processQ({ breakpoints, breakpointCollections }, q) {
    const firstChar = q[0];
    const secondChar = q[1];
    // Handle breakpoint collection references ($collection)
    if (firstChar === '$') {
        return processBreakpointCollection({
            breakpoints,
            breakpointCollections
        }, q);
    }
    // Handle less-than queries (< or <=)
    if (firstChar === '<') {
        return processLessThanQuery({
            breakpoints
        }, q, secondChar);
    }
    // Handle greater-than queries (> or >=)
    if (firstChar === '>') {
        return processGreaterThanQuery({
            breakpoints
        }, q, secondChar);
    }
    // Handle equals queries (=)
    if (firstChar === '=') {
        throw new Error('parseQ: Mediaqueries should not start with =');
    }
    // Handle default case (direct breakpoint reference)
    return processDirectBreakpoint({
        breakpoints
    }, q);
}
/**
 * Process a breakpoint collection reference
 * @param {Object} config - Configuration object
 * @param {String} key - Collection key
 * @returns {Array} Processed query results
 */ function processBreakpointCollection({ breakpoints, breakpointCollections }, key) {
    if (!breakpointCollections) {
        throw new Error(`parseQ: No \`breakpointCollection\` set in config, but \`${key}\` was referenced`);
    }
    const resolvedBreakpointQ = breakpointCollections[key];
    if (!resolvedBreakpointQ) {
        throw new Error(`parseQ: Breakpoint collection \`${key}\` not found!`);
    }
    return parseQ({
        breakpoints,
        breakpointCollections
    }, resolvedBreakpointQ);
}
/**
 * Process a less-than query (< or <=)
 * @param {Object} config - Configuration with breakpoints
 * @param {String} q - Query string
 * @param {String} secondChar - Second character of query string
 * @returns {Object} Media query constraints
 */ function processLessThanQuery({ breakpoints }, q, secondChar) {
    if (secondChar === '=') {
        // <= (less than or equal to)
        const key = q.substring(2);
        const max = (0, _calcMaxFromBreakpoint.default)(breakpoints, key);
        // For <= queries, we want a min-width of 0 and the calculated max
        return {
            min: '0',
            max
        };
    } else {
        // < (less than)
        const key = q.substring(1);
        const max = (0, _calcMaxFromPreviousBreakpoint.default)(breakpoints, key);
        return {
            min: '0',
            ...max && {
                max
            }
        };
    }
}
/**
 * Process a greater-than query (> or >=)
 * @param {Object} config - Configuration with breakpoints
 * @param {String} q - Query string
 * @param {String} secondChar - Second character of query string
 * @returns {Object} Media query constraints
 */ function processGreaterThanQuery({ breakpoints }, q, secondChar) {
    if (secondChar === '=') {
        // >= (greater than or equal to)
        const key = q.substring(2);
        // Only return min with no max for >= queries
        return {
            min: breakpoints[key]
        };
    } else {
        // > (greater than)
        const key = q.substring(1);
        return {
            min: (0, _calcMaxFromNextBreakpoint.default)(breakpoints, key)
        };
    }
}
/**
 * Process a direct breakpoint reference
 * @param {Object} config - Configuration with breakpoints
 * @param {String} key - Breakpoint key
 * @returns {Object} Media query constraints
 */ function processDirectBreakpoint({ breakpoints }, key) {
    const min = breakpoints[key];
    const max = (0, _calcMaxFromBreakpoint.default)(breakpoints, key);
    return {
        min,
        ...max && {
            max
        }
    };
}
