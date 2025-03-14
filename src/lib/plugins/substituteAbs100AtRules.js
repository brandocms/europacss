import postcss from 'postcss'
import buildFullMediaQuery from '../../util/buildFullMediaQuery'
import buildMediaQueryQ from '../../util/buildMediaQueryQ'
import findResponsiveParent from '../../util/findResponsiveParent'
import extractBreakpointKeys from '../../util/extractBreakpointKeys'
import advancedBreakpointQuery from '../../util/advancedBreakpointQuery'
import buildDecl from '../../util/buildDecl'

/**
 * ABS100
 *
 * Creates absolute positioning with 100% width and height.
 *
 * @param breakpoint    - Optional breakpoint query (e.g., desktop, >=md)
 *
 * Examples:
 *
 *    @abs100;          // Apply absolute positioning across all breakpoints
 *    @abs100 sm;       // Apply absolute positioning only at sm breakpoint
 *    @abs100 $desktop; // Apply absolute positioning for desktop collection
 *    @abs100 >=tablet; // Apply absolute positioning for tablet and up
 *
 */

module.exports = getConfig => {
  const config = getConfig()

  return {
    postcssPlugin: 'europacss-abs100',
    prepare() {
      return {
        AtRule: {
          // Handle regular @abs100 rule
          abs100: atRule => {
            processRule(atRule, config, false)
          },
          // Handle @abs100! rule (important flag)
          'abs100!': atRule => {
            processRule(atRule, config, true)
          }
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule, config, flagAsImportant) {
  // Validate rule context
  if (atRule.parent.type === 'root') {
    throw atRule.error(`ABS100: Should only be used inside a rule, not on root.`)
  }

  if (atRule.nodes) {
    throw atRule.error(`ABS100: Should not include children.`)
  }

  const {
    theme: { breakpoints, breakpointCollections }
  } = config

  const parent = atRule.parent

  // Clone rule to act upon. We remove the atRule from DOM later, but
  // we still need some data from the original.
  const clonedRule = atRule.clone()
  let parsedBreakpoints
  
  // Parse the rule parameters: only breakpoint query is accepted
  let [bpQuery] = postcss.list.space(clonedRule.params)
  
  // Check if we're nested under a @responsive rule.
  // If so, we don't create a media query, and we also won't
  // accept a query param for @abs100
  const responsiveParent = findResponsiveParent(atRule)

  if (responsiveParent) {
    // Under @responsive, we can't have a breakpoint query in @abs100
    if (bpQuery) {
      throw clonedRule.error(
        `ABS100: @abs100 cannot be nested under @responsive and have a breakpoint query.`,
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

  // Use buildDecl to generate the abs100 declarations
  const absDecls = buildDecl('abs100', null, flagAsImportant)

  if (bpQuery) {
    // We have a breakpoint query, extract all affected breakpoints
    let affectedBreakpoints = parsedBreakpoints || 
      extractBreakpointKeys({ breakpoints, breakpointCollections }, bpQuery)

    // Create media queries for each affected breakpoint
    affectedBreakpoints.forEach(bp => {
      // Create media query rule
      const mediaRule = clonedRule.clone({
        name: 'media',
        params: buildMediaQueryQ({ breakpoints, breakpointCollections }, bp)
      })

      // Add declarations and insert before the @abs100 rule
      mediaRule.append(absDecls)
      mediaRule.source = src
      atRule.before(mediaRule)
    })
  } else {
    // No breakpoint query specified, add directly to parent
    parent.prepend(absDecls)
  }

  // Cleanup - remove the original @abs100 rule
  atRule.remove()

  // Remove parent if it's now empty
  if (parent && !parent.nodes.length) {
    parent.remove()
  }
}