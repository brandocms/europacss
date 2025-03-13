import _ from 'lodash'
import parseQ from './parseQ'

// for single breakpoints, use buildSpecificMediaQuery

export default function buildMediaQueryQ ({ breakpoints, breakpointCollections }, q) {
  const queryStrings = parseQ({ breakpoints, breakpointCollections }, q)
  
  // Optimize by collapsing adjacent breakpoints
  const optimizedQueryStrings = optimizeQueries(queryStrings, breakpoints)

  return _(optimizedQueryStrings)
    .map(screen => {
      return _(screen)
        .map((value, feature) => {
          feature = _.get(
            {
              min: 'min-width',
              max: 'max-width'
            },
            feature,
            feature
          )
          return `(${feature}: ${value})`
        })
        .join(' and ')
    })
    .join(', ')
}

/**
 * Get ordered breakpoint keys from breakpoints object
 * @param {Object} breakpoints - Breakpoint definitions
 * @returns {Array} Ordered breakpoint keys
 */
function getOrderedBreakpointKeys(breakpoints) {
  // Create array of [key, value] pairs
  const entries = Object.entries(breakpoints)
  
  // Sort by breakpoint value (convert to numbers for comparison)
  entries.sort((a, b) => {
    const valueA = parseInt(a[1], 10)
    const valueB = parseInt(b[1], 10)
    return valueA - valueB
  })
  
  // Return just the keys
  return entries.map(entry => entry[0])
}

/**
 * Optimize media queries by collapsing adjacent breakpoints
 * @param {Array} queries - Array of query objects with min/max constraints
 * @param {Object} breakpoints - Breakpoint definitions
 * @returns {Array} Optimized queries
 */
function optimizeQueries(queries, breakpoints) {
  if (queries.length <= 1) {
    return queries
  }

  // Extract ordered breakpoint keys for comparison
  const orderedBreakpointKeys = getOrderedBreakpointKeys(breakpoints)
  
  // Group queries that can be merged
  const groups = []
  let currentGroup = [queries[0]]
  
  for (let i = 1; i < queries.length; i++) {
    const current = queries[i]
    const previous = queries[i - 1]
    
    // Check if breakpoints are adjacent
    if (areAdjacentBreakpoints(previous, current, orderedBreakpointKeys, breakpoints)) {
      currentGroup.push(current)
    } else {
      groups.push(currentGroup)
      currentGroup = [current]
    }
  }
  
  // Add the last group
  if (currentGroup.length > 0) {
    groups.push(currentGroup)
  }
  
  // Merge each group into a single query
  return groups.map(group => {
    if (group.length === 1) {
      return group[0]
    }
    
    // Merge the group by taking the min from the first and max from the last
    // Special case: If the last breakpoint doesn't have max, the merged query won't have max
    const firstQuery = group[0]
    const lastQuery = group[group.length - 1]
    
    return {
      min: firstQuery.min,
      ...(lastQuery.max ? { max: lastQuery.max } : {})
    }
  })
}

/**
 * Check if two breakpoints are adjacent in the breakpoint scale
 * @param {Object} query1 - First query with min/max constraints
 * @param {Object} query2 - Second query with min/max constraints
 * @param {Array} orderedKeys - Ordered breakpoint keys
 * @param {Object} breakpoints - Breakpoint definitions
 * @returns {Boolean} Whether the breakpoints are adjacent
 */
function areAdjacentBreakpoints(query1, query2, orderedKeys, breakpoints) {
  // Find breakpoint keys for each query based on min values
  let key1, key2
  
  for (const key of orderedKeys) {
    if (query1.min === breakpoints[key]) {
      key1 = key
    }
    if (query2.min === breakpoints[key]) {
      key2 = key
    }
  }
  
  if (!key1 || !key2) {
    return false
  }
  
  // Check if breakpoints are adjacent in the ordered keys
  const index1 = orderedKeys.indexOf(key1)
  const index2 = orderedKeys.indexOf(key2)
  
  // Two queries are adjacent if:
  // 1. Their keys are adjacent in the ordered list
  // 2. The max value of the first query is the same as the min value of the second query minus 1px
  return Math.abs(index1 - index2) === 1
}
