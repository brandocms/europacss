import _ from 'lodash'
import buildFullMediaQuery from '../../util/buildFullMediaQuery'
import buildMediaQueryQ from '../../util/buildMediaQueryQ'
import findResponsiveParent from '../../util/findResponsiveParent'
import postcss from 'postcss'
import extractBreakpointKeys from '../../util/extractBreakpointKeys'
import buildDecl from '../../util/buildDecl'
import parseSize from '../../util/parseSize'
import sizeNeedsBreakpoints from '../../util/sizeNeedsBreakpoints'
import advancedBreakpointQuery from '../../util/advancedBreakpointQuery'

/**
 * SPACE
 *
 * @param prop          - prop to modify
 * @param size          - size of spacing
 * @param breakpoint    - if this should only apply to ONE breakpoint
 *
 * Examples:
 *
 *    @space margin-top xl;
 *    @space margin-top sm xs;
 *
 */

module.exports = getConfig => {
  const config = getConfig()

  return {
    postcssPlugin: 'europacss-space',
    prepare() {
      return {
        AtRule: {
          space: atRule => {
            processRule(atRule, config, false)
          },
          'space!': atRule => {
            processRule(atRule, config, true)
          }
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule, config, flagAsImportant) {
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
  let clonedRule = atRule.clone()
  let parsedBreakpoints
  let [prop, size, bpQuery] = postcss.list.space(clonedRule.params)
  if (prop === 'container') {
    bpQuery = size
    size = null
  }

  // Check if we're nested under a @responsive rule.
  // If so, we don't create a media query, and we also won't
  // accept a query param for @space
  const responsiveParent = findResponsiveParent(atRule)

  if (responsiveParent) {
    if (bpQuery) {
      throw clonedRule.error(
        `SPACING: @space cannot be nested under @responsive and have a breakpoint query.`,
        {
          name: bpQuery
        }
      )
    }

    bpQuery = responsiveParent.__mediaQuery

    // try to grab the breakpoint
    if (advancedBreakpointQuery(responsiveParent.__mediaQuery)) {
      // parse the breakpoints
      parsedBreakpoints = extractBreakpointKeys(
        { breakpoints, breakpointCollections },
        responsiveParent.__mediaQuery
      )
    }
  }

  const src = atRule.source

  if (!parsedBreakpoints && bpQuery && advancedBreakpointQuery(bpQuery)) {
    parsedBreakpoints = extractBreakpointKeys({ breakpoints, breakpointCollections }, bpQuery)
  }

  if (bpQuery) {
    // We have a breakpoint query, like '>=sm'. Extract all breakpoints
    // we need media queries for. Since there is a breakpoint query, we
    // HAVE to generate breakpoints even if the sizeQuery doesn't
    // call for it.
    let affectedBreakpoints

    if (!parsedBreakpoints) {
      affectedBreakpoints = extractBreakpointKeys({ breakpoints, breakpointCollections }, bpQuery)
    } else {
      affectedBreakpoints = parsedBreakpoints
    }

    _.each(affectedBreakpoints, bp => {
      let parsedSize = null
      if (size) {
        parsedSize = parseSize(clonedRule, config, size, bp)
      }
      const sizeDecls = buildDecl(prop, parsedSize, flagAsImportant, config, bp)

      const mediaRule = clonedRule.clone({
        name: 'media',
        params: buildMediaQueryQ({ breakpoints, breakpointCollections }, bp)
      })

      mediaRule.append(sizeDecls)
      mediaRule.source = src
      atRule.before(mediaRule)
    })
  } else {
    if (sizeNeedsBreakpoints(spacing, size)) {
      _.keys(breakpoints).forEach(bp => {
        let parsedSize = null
        if (size) {
          parsedSize = parseSize(clonedRule, config, size, bp)
        }
        const mediaRule = clonedRule.clone({
          name: 'media',
          params: buildFullMediaQuery(breakpoints, bp)
        })
        const sizeDecls = buildDecl(prop, parsedSize, flagAsImportant, config, bp)
        mediaRule.append(sizeDecls)
        atRule.before(mediaRule)
      })
    } else {
      const parsedSize = parseSize(clonedRule, config, size)
      const sizeDecls = buildDecl(prop, parsedSize, flagAsImportant)
      parent.prepend(sizeDecls)
    }
  }

  atRule.remove()

  // check if parent has anything
  if (parent && !parent.nodes.length) {
    parent.remove()
  }
}
