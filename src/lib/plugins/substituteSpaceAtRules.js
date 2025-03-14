import _ from 'lodash'
import postcss from 'postcss'
import buildFullMediaQuery from '../../util/buildFullMediaQuery'
import buildMediaQueryQ from '../../util/buildMediaQueryQ'
import findResponsiveParent from '../../util/findResponsiveParent'
import extractBreakpointKeys from '../../util/extractBreakpointKeys'
import buildDecl from '../../util/buildDecl'
import parseSize from '../../util/parseSize'
import sizeNeedsBreakpoints from '../../util/sizeNeedsBreakpoints'
import advancedBreakpointQuery from '../../util/advancedBreakpointQuery'

/**
 * SPACE
 *
 * @param prop          - CSS property to modify (e.g., margin-top, padding)
 * @param size          - Size of spacing (e.g., xs, md, xl)
 * @param breakpoint    - Optional breakpoint query (e.g., desktop, >=md)
 *
 * Examples:
 *
 *    @space margin-top xl;         // Apply xl margin-top across all breakpoints
 *    @space margin-top sm xs;      // Apply sm margin-top only at xs breakpoint
 *    @space padding-x md >=tablet; // Apply md padding for tablet and up
 *
 */

module.exports = getConfig => {
  const config = getConfig()

  return {
    postcssPlugin: 'europacss-space',
    prepare() {
      return {
        AtRule: {
          // Handle regular @space rule
          space: atRule => {
            processRule(atRule, config, false)
          },
          // Handle @space! rule (important flag)
          'space!': atRule => {
            processRule(atRule, config, true)
          }
        }
      }
    }
  }
}

module.exports.postcss = true

/**
 * Group breakpoints by equal values to optimize media queries
 * @param {Object} config - Configuration object
 * @param {String} size - The size identifier
 * @param {Array} breakpointKeys - Array of breakpoint names to process
 * @param {String} prop - The CSS property being modified
 * @returns {Object} Object where keys are values and values are breakpoint groups
 */
function groupBreakpointsByValue(clonedRule, config, size, breakpointKeys, prop) {
  const valueGroups = {};
  const orderedBreakpointKeys = [...breakpointKeys].sort((a, b) => {
    // Sort breakpoints by value numerically (low to high)
    const valueA = parseInt(config.theme.breakpoints[a], 10) || 0;
    const valueB = parseInt(config.theme.breakpoints[b], 10) || 0;
    return valueA - valueB;
  });
  
  // Special case: setMaxForVw setting 
  // When this is true, we need to handle the largest breakpoint separately
  // as it will have px values instead of vw values
  const hasMaxForVw = config && config.setMaxForVw === true;
  const largestBreakpoint = hasMaxForVw ? orderedBreakpointKeys[orderedBreakpointKeys.length - 1] : null;
  
  // Special case: Handle container values based on both padding and maxWidth
  const isContainer = prop === 'container';
  
  // Parse size for each breakpoint and group by value
  orderedBreakpointKeys.forEach(bp => {
    // Special case: When using setMaxForVw, always treat the largest breakpoint as a separate group
    if (hasMaxForVw && bp === largestBreakpoint) {
      const parsedSize = parseSize(clonedRule, config, size, bp);
      const valueKey = String(parsedSize) + '_maxBreakpoint'; // Ensure it's a unique key
      valueGroups[valueKey] = [bp];
      return;
    }
    
    // For container, we need to compare both padding and maxWidth
    // Only merge if both values are the same
    if (isContainer) {
      // For container, we need to create a composite key with both padding and maxWidth
      const { theme } = config;
      
      // Only proceed if container config exists
      if (theme && theme.container) {
        // Create a composite key from both container properties
        const paddingValue = theme.container.padding && theme.container.padding[bp];
        const maxWidthValue = theme.container.maxWidth && theme.container.maxWidth[bp];
        
        const containerKey = `padding:${paddingValue},maxWidth:${maxWidthValue}`;
        
        if (!valueGroups[containerKey]) {
          valueGroups[containerKey] = [];
        }
        
        valueGroups[containerKey].push(bp);
      } else {
        // If no container config, treat each breakpoint separately
        const uniqueKey = `container_${bp}`;
        valueGroups[uniqueKey] = [bp];
      }
      return;
    }
    
    // Regular case for non-container properties
    const parsedSize = parseSize(clonedRule, config, size, bp);
    
    // Convert to string for comparison
    const valueKey = String(parsedSize);
    
    if (!valueGroups[valueKey]) {
      valueGroups[valueKey] = [];
    }
    
    valueGroups[valueKey].push(bp);
  });
  
  return valueGroups;
}

function processRule(atRule, config, flagAsImportant) {
  // Validate rule context
  if (atRule.parent.type === 'root') {
    throw atRule.error(`SPACING: Should only be used inside a rule, not on root.`)
  }

  if (atRule.nodes) {
    throw atRule.error(`SPACING: Spacing should not include children.`)
  }

  const {
    theme: { breakpoints, breakpointCollections, spacing }
  } = config

  const parent = atRule.parent

  // Clone rule to act upon. We remove the atRule from DOM later, but
  // we still need some data from the original.
  const clonedRule = atRule.clone()
  let parsedBreakpoints
  
  // Parse the rule parameters: property, size, and optional breakpoint query
  let [prop, size, bpQuery] = postcss.list.space(clonedRule.params)
  
  // Special case for container
  if (prop === 'container') {
    bpQuery = size
    size = null
  }

  // Check if we're nested under a @responsive rule.
  // If so, we don't create a media query, and we also won't
  // accept a query param for @space
  const responsiveParent = findResponsiveParent(atRule)

  if (responsiveParent) {
    // Under @responsive, we can't have a breakpoint query in @space
    if (bpQuery) {
      throw clonedRule.error(
        `SPACING: @space cannot be nested under @responsive and have a breakpoint query.`,
        { name: bpQuery }
      )
    }

    // Use the parent's media query
    bpQuery = responsiveParent.__mediaQuery

    // For advanced queries, parse the breakpoints
    if (advancedBreakpointQuery(responsiveParent.__mediaQuery)) {
      parsedBreakpoints = extractBreakpointKeys(
        { breakpoints, breakpointCollections },
        responsiveParent.__mediaQuery
      )
    }
  }

  const src = atRule.source

  // Parse breakpoints from advanced query if not already processed
  if (!parsedBreakpoints && bpQuery && advancedBreakpointQuery(bpQuery)) {
    parsedBreakpoints = extractBreakpointKeys({ breakpoints, breakpointCollections }, bpQuery)
  }

  if (bpQuery) {
    // We have a breakpoint query, extract all affected breakpoints
    let affectedBreakpoints = parsedBreakpoints || 
      extractBreakpointKeys({ breakpoints, breakpointCollections }, bpQuery)

    // Create media queries for each affected breakpoint
    _.each(affectedBreakpoints, bp => {
      // Parse size for this breakpoint
      const parsedSize = size ? parseSize(clonedRule, config, size, bp) : null
      
      // Build the CSS declarations
      const sizeDecls = buildDecl(prop, parsedSize, flagAsImportant, config, bp)

      // Create media query rule
      const mediaRule = clonedRule.clone({
        name: 'media',
        params: buildMediaQueryQ({ breakpoints, breakpointCollections }, bp)
      })

      // Add declarations and insert before the @space rule
      mediaRule.append(sizeDecls)
      mediaRule.source = src
      atRule.before(mediaRule)
    })
  } else {
    // No breakpoint query specified
    if (sizeNeedsBreakpoints(spacing, size)) {
      // Get all breakpoint keys
      const breakpointKeys = _.keys(breakpoints);
      
      // Group breakpoints with equal values
      const groupedBreakpoints = groupBreakpointsByValue(clonedRule, config, size, breakpointKeys, prop);
      
      // For each distinct value, create a media query with the combined breakpoints
      Object.entries(groupedBreakpoints).forEach(([value, bps]) => {
        if (bps.length > 0) {
          // Parse size for the first breakpoint in the group (they all have the same value)
          const parsedSize = size ? parseSize(clonedRule, config, size, bps[0]) : null;
          
          // Build the CSS declarations
          const sizeDecls = buildDecl(prop, parsedSize, flagAsImportant, config, bps[0]);
          
          // Special case: If we're targeting all breakpoints and there's only one value,
          // we don't need a media query at all - can add directly to parent
          if (bps.length === breakpointKeys.length) {
            // This value applies to all breakpoints, so no media query needed
            parent.prepend(sizeDecls);
          } else {
            // If multiple breakpoints have the same value, join them with "/"
            const bpString = bps.join('/');
            
            // Create media query rule with the combined breakpoint string
            const mediaRule = clonedRule.clone({
              name: 'media',
              // Use the combined string for building the media query
              params: buildMediaQueryQ({ breakpoints, breakpointCollections }, bpString)
            });
            
            // Add declarations and insert before the @space rule
            mediaRule.append(sizeDecls);
            mediaRule.source = src;
            atRule.before(mediaRule);
          }
        }
      });
    } else {
      // Size is not responsive, add directly to parent rule
      const parsedSize = parseSize(clonedRule, config, size)
      const sizeDecls = buildDecl(prop, parsedSize, flagAsImportant)
      parent.prepend(sizeDecls)
    }
  }

  // Cleanup - remove the original @space rule
  atRule.remove()

  // Remove parent if it's now empty
  if (parent && !parent.nodes.length) {
    parent.remove()
  }
}