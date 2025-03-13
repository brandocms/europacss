"use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, // for single breakpoints, use buildSpecificMediaQuery
"default", {
    enumerable: true,
    get: function() {
        return buildMediaQueryQ;
    }
});
const _lodash = /*#__PURE__*/ _interop_require_default(require("lodash"));
const _parseQ = /*#__PURE__*/ _interop_require_default(require("./parseQ"));
function _interop_require_default(obj) {
    return obj && obj.__esModule ? obj : {
        default: obj
    };
}
function buildMediaQueryQ({ breakpoints , breakpointCollections  }, q) {
    const queryStrings = (0, _parseQ.default)({
        breakpoints,
        breakpointCollections
    }, q);
    // Optimize by collapsing adjacent breakpoints
    const optimizedQueryStrings = optimizeQueries(queryStrings, breakpoints);
    return (0, _lodash.default)(optimizedQueryStrings).map((screen)=>{
        return (0, _lodash.default)(screen).map((value, feature)=>{
            feature = _lodash.default.get({
                min: "min-width",
                max: "max-width"
            }, feature, feature);
            return `(${feature}: ${value})`;
        }).join(" and ");
    }).join(", ");
}
/**
 * Get ordered breakpoint keys from breakpoints object
 * @param {Object} breakpoints - Breakpoint definitions
 * @returns {Array} Ordered breakpoint keys
 */ function getOrderedBreakpointKeys(breakpoints) {
    // Create array of [key, value] pairs
    const entries = Object.entries(breakpoints);
    // Sort by breakpoint value (convert to numbers for comparison)
    entries.sort((a, b)=>{
        const valueA = parseInt(a[1], 10);
        const valueB = parseInt(b[1], 10);
        return valueA - valueB;
    });
    // Return just the keys
    return entries.map((entry)=>entry[0]);
}
/**
 * Optimize media queries by collapsing adjacent breakpoints
 * @param {Array} queries - Array of query objects with min/max constraints
 * @param {Object} breakpoints - Breakpoint definitions
 * @returns {Array} Optimized queries
 */ function optimizeQueries(queries, breakpoints) {
    if (queries.length <= 1) {
        return queries;
    }
    // Extract ordered breakpoint keys for comparison
    const orderedBreakpointKeys = getOrderedBreakpointKeys(breakpoints);
    // Group queries that can be merged
    const groups = [];
    let currentGroup = [
        queries[0]
    ];
    for(let i = 1; i < queries.length; i++){
        const current = queries[i];
        const previous = queries[i - 1];
        // Check if breakpoints are adjacent
        if (areAdjacentBreakpoints(previous, current, orderedBreakpointKeys, breakpoints)) {
            currentGroup.push(current);
        } else {
            groups.push(currentGroup);
            currentGroup = [
                current
            ];
        }
    }
    // Add the last group
    if (currentGroup.length > 0) {
        groups.push(currentGroup);
    }
    // Merge each group into a single query
    return groups.map((group)=>{
        if (group.length === 1) {
            return group[0];
        }
        // Merge the group by taking the min from the first and max from the last
        // Special case: If the last breakpoint doesn't have max, the merged query won't have max
        const firstQuery = group[0];
        const lastQuery = group[group.length - 1];
        return {
            min: firstQuery.min,
            ...lastQuery.max ? {
                max: lastQuery.max
            } : {}
        };
    });
}
/**
 * Check if two breakpoints are adjacent in the breakpoint scale
 * @param {Object} query1 - First query with min/max constraints
 * @param {Object} query2 - Second query with min/max constraints
 * @param {Array} orderedKeys - Ordered breakpoint keys
 * @param {Object} breakpoints - Breakpoint definitions
 * @returns {Boolean} Whether the breakpoints are adjacent
 */ function areAdjacentBreakpoints(query1, query2, orderedKeys, breakpoints) {
    // Find breakpoint keys for each query based on min values
    let key1, key2;
    for (const key of orderedKeys){
        if (query1.min === breakpoints[key]) {
            key1 = key;
        }
        if (query2.min === breakpoints[key]) {
            key2 = key;
        }
    }
    if (!key1 || !key2) {
        return false;
    }
    // Check if breakpoints are adjacent in the ordered keys
    const index1 = orderedKeys.indexOf(key1);
    const index2 = orderedKeys.indexOf(key2);
    // Two queries are adjacent if they're adjacent in the ordered breakpoint list AND
    // the first query has a max-width and the second has a min-width, making them continuous
    if (Math.abs(index1 - index2) === 1) {
        // For adjacent breakpoints, the first one's max value should equal the second one's min value minus 1
        // This ensures there's no gap between the two media queries
        if (query1.max && query2.min) {
            // Get the numeric values for comparison
            const maxValue = parseInt(query1.max.replace("px", ""), 10);
            const minValue = parseInt(query2.min.replace("px", ""), 10);
            // For truly adjacent queries, the max of one should be 1px less than the min of the next
            return minValue === maxValue + 1;
        }
        return true;
    }
    return false;
}
