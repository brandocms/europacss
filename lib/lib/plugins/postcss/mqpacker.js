/**
 * Custom Media Query Packer (based on css-mqgroup)
 *
 * This plugin groups and sorts media queries, properly handling width-only constraints
 * and ensuring proper mobile-first ordering.
 */ /**
 * Checks if a rule is a source map annotation
 * @param {Object} rule - PostCSS rule
 * @returns {Boolean} Whether it's a source map annotation
 */ "use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "default", {
    enumerable: true,
    get: function() {
        return _default;
    }
});
const isSourceMapAnnotation = (rule)=>{
    if (!rule) {
        return false;
    }
    if (rule.type !== 'comment') {
        return false;
    }
    if (rule.text.toLowerCase().indexOf('# sourcemappingurl=') !== 0) {
        return false;
    }
    return true;
};
/**
 * Normalizes a media query string to a standardized format
 * This helps us identify and group equivalent queries with different syntax
 * @param {String} params - Media query string
 * @returns {String} Normalized query
 */ const normalizeMediaQuery = (params)=>{
    // First convert legacy min-width/max-width to modern width syntax
    params = params.replace(/\(\s*min-width\s*:\s*([^)]+)\)/g, '(width >= $1)');
    params = params.replace(/\(\s*max-width\s*:\s*([^)]+)\)/g, '(width <= $1)');
    return params;
};
/**
 * Gets the min-width value from a media query, properly handling the case of max-width-only
 * @param {String} params - Media query string
 * @returns {Number} The min-width value (or 0 for width-only queries)
 */ const getMinWidth = (params)=>{
    // Normalize the params first to handle both formats consistently
    const normalizedParams = normalizeMediaQuery(params);
    // Handle width-only constraints (no min constraint)
    if (normalizedParams.includes('width <=') && !normalizedParams.includes('width >=')) {
        return 0 // This is a mobile-only query, should be first
        ;
    }
    // Extract min-width value from normalized params
    const minWidthMatch = normalizedParams.match(/\(\s*width\s*>=\s*([0-9.]+)(px|em|rem)?\s*\)/i);
    if (minWidthMatch) {
        return parseFloat(minWidthMatch[1]);
    }
    // Default to 0 for any query without explicit min-width
    return 0;
};
/**
 * Gets the max-width value from a media query if it exists
 * @param {String} params - Media query string
 * @returns {Number} The max-width value or Infinity if not present
 */ const getMaxWidth = (params)=>{
    // Normalize the params first
    const normalizedParams = normalizeMediaQuery(params);
    // Extract max-width value
    const maxWidthMatch = normalizedParams.match(/\(\s*width\s*<=\s*([0-9.]+)(px|em|rem)?\s*\)/i);
    if (maxWidthMatch) {
        return parseFloat(maxWidthMatch[1]);
    }
    // If no max-width is specified, return Infinity
    return Infinity;
};
/**
 * Sort function for media queries that respects mobile-first ordering
 * and properly handles secondary sorting by max-width when min-width is equal
 * @param {String} a - First media query
 * @param {String} b - Second media query
 * @returns {Number} Sort order
 */ const sortMobileFirst = (a, b)=>{
    const minWidthA = getMinWidth(a);
    const minWidthB = getMinWidth(b);
    // If min widths are different, that's our primary sort key
    if (minWidthA !== minWidthB) {
        return minWidthA - minWidthB;
    }
    // For equal min widths, sort by max width (smaller max first)
    // If one doesn't have max, it should come first (no max = most general)
    const maxWidthA = getMaxWidth(a);
    const maxWidthB = getMaxWidth(b);
    // Sort order for max widths:
    // 1. Queries without max (Infinity) come first
    // 2. If both have max-width, sort by ascending order (smaller max comes first)
    if (maxWidthA === Infinity) return -1;
    if (maxWidthB === Infinity) return 1;
    return maxWidthA - maxWidthB;
};
/**
 * Process a CSS tree
 * @param {Object} css - PostCSS CSS tree
 * @param {Object} options - Plugin options
 * @returns {Object} Processed CSS tree
 */ const processCss = (css, options)=>{
    // Get source-map annotation
    let sourceMap = css.last;
    if (!isSourceMapAnnotation(sourceMap)) {
        sourceMap = null;
    }
    // Create map to store media queries by params
    const mediaQueries = {};
    const mediaParams = [];
    // Find all @media rules
    css.walkAtRules('media', (rule)=>{
        // Normalize the params to our standardized format
        const originalParams = rule.params;
        const normalizedParams = normalizeMediaQuery(originalParams);
        // Use the normalized params as the key for grouping identical queries
        if (mediaQueries[normalizedParams]) {
            // If we already have a media query with these params, merge rules
            rule.each((node)=>{
                mediaQueries[normalizedParams].append(node.clone());
            });
        } else {
            // Otherwise, save this as a new media query
            const clonedRule = rule.clone();
            // Use the normalized params for consistency
            clonedRule.params = normalizedParams;
            mediaQueries[normalizedParams] = clonedRule;
            mediaParams.push(normalizedParams);
        }
        // Remove the original rule
        rule.remove();
    });
    // Sort media params if sorting is enabled
    if (options.sort) {
        mediaParams.sort(sortMobileFirst);
    }
    // Re-insert media queries at the end of the CSS
    mediaParams.forEach((params)=>{
        css.append(mediaQueries[params]);
    });
    // Move source-map to the end if it exists
    if (sourceMap) {
        css.append(sourceMap);
    }
    return css;
};
/**
 * PostCSS plugin definition
 */ const mqpacker = (opts = {})=>{
    const options = {
        sort: true,
        ...opts
    };
    return {
        postcssPlugin: 'europacss-mqpacker',
        Once (css) {
            return processCss(css, options);
        }
    };
};
mqpacker.postcss = true;
const _default = mqpacker;
