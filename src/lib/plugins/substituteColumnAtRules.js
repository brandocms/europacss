import _ from 'lodash'
import postcss from 'postcss'
import reduceCSSCalc from 'reduce-css-calc'
import buildFullMediaQuery from '../../util/buildFullMediaQuery'
import buildMediaQueryQ from '../../util/buildMediaQueryQ'
import extractBreakpointKeys from '../../util/extractBreakpointKeys'
import buildDecl from '../../util/buildDecl'
import parseSize from '../../util/parseSize'
import advancedBreakpointQuery from '../../util/advancedBreakpointQuery'
import splitBreakpoints from '../../util/splitBreakpoints'
import findResponsiveParent from '../../util/findResponsiveParent'

/**
 * For some reason, Firefox is not consistent with how it calculates vw widths.
 * This manifests through our `@column` helper when wrapping. Sometimes when
 * resizing, it will flicker the element down to the next row and up again, as
 * if there is not enough room for the specified number of items to flex before
 * wrap. We try to circumvent this by setting the element's `max-width` 0.002vw
 * wider than the flex-basis.
 */
const FIX_FIREFOX_FLEX_VW_BUG = true

/**
 * COLUMN
 *
 * @param {sizeQuery}
 * @param [breakpointQuery]
 * @param [alignment]
 *
 * Examples:
 *
 *    @column 6/12;
 *    @column 6/12 xs;
 *    @column 6/12 xs center;
 *
 *    @column 6:1/12;
 *    @column calc(var[6/12]);
 *
 */

module.exports = getConfig => {
  const config = getConfig()
  const finalRules = []

  return {
    postcssPlugin: 'europacss-column',
    prepare({ root }) {
      return {
        AtRule: {
          column: atRule => processRule(atRule, config)
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule, config) {
  const {
    theme: { breakpoints, breakpointCollections }
  } = config

  const src = atRule.source
  const parent = atRule.parent
  let [suppliedSize, suppliedBreakpoint] = postcss.list.space(atRule.params)
  let needsBreakpoints = false
  let alreadyResponsive = false
  let flexDecls = []

  if (parent.type === 'root') {
    throw atRule.error(`COLUMN: Can only be used inside a rule, not on root.`)
  }

  if (suppliedSize.indexOf('@') > -1) {
    throw atRule.error(`COLUMN: Old size@breakpoint syntax is removed. Use a space instead`)
  }

  const responsiveParent = findResponsiveParent(atRule)

  // Check if we're nested under a @responsive rule.
  // If so, we don't create a media query, and we also won't
  // accept a query param for @space
  if (responsiveParent) {
    if (suppliedBreakpoint) {
      throw atRule.error(
        `COLUMN: When nesting @column under @responsive, we do not accept a breakpoints query.`,
        { name: suppliedBreakpoint }
      )
    }
    // try to grab the breakpoint
    if (advancedBreakpointQuery(responsiveParent.__mediaQuery)) {
      // parse the breakpoints
      suppliedBreakpoint = extractBreakpointKeys(
        { breakpoints, breakpointCollections },
        responsiveParent.__mediaQuery
      ).join('/')
    } else {
      suppliedBreakpoint = responsiveParent.__mediaQuery
    }

    if (suppliedBreakpoint.indexOf('/') > -1) {
      // multiple breakpoints, we can't use the breakpoints
      alreadyResponsive = false
    } else {
      alreadyResponsive = true
    }
  }

  if (!suppliedBreakpoint) {
    needsBreakpoints = true
  }

  if (suppliedBreakpoint && advancedBreakpointQuery(suppliedBreakpoint)) {
    suppliedBreakpoint = extractBreakpointKeys(
      { breakpoints, breakpointCollections },
      suppliedBreakpoint
    ).join('/')
  }

  if (needsBreakpoints) {
    _.keys(breakpoints).forEach(bp => {
      let parsedSize = parseSize(atRule, config, suppliedSize, bp)

      flexDecls = []
      createFlexDecls(flexDecls, parsedSize)

      const mediaRule = postcss.atRule({
        name: 'media',
        params: buildFullMediaQuery(breakpoints, bp)
      })
      mediaRule.append(...flexDecls)
      atRule.before(mediaRule)
    })
  } else {
    // has suppliedBreakpoint, either from a @responsive parent, or a supplied bpQuery
    if (alreadyResponsive) {
      flexDecls = []
      let parsedSize = parseSize(atRule, config, suppliedSize, suppliedBreakpoint)
      createFlexDecls(flexDecls, parsedSize)
      parent.prepend(...flexDecls)
    } else {
      splitBreakpoints(suppliedBreakpoint).forEach(bp => {
        flexDecls = []
        let parsedSize = parseSize(atRule, config, suppliedSize, bp)

        createFlexDecls(flexDecls, parsedSize)

        const mediaRule = postcss.atRule({
          name: 'media',
          params: buildMediaQueryQ({ breakpoints, breakpointCollections }, bp)
        })

        mediaRule.source = src
        mediaRule.append(...flexDecls)

        const sendToRoot = postcss.atRule({ name: 'at-root' })
        sendToRoot.append(mediaRule)
        atRule.before(mediaRule)
      })
    }
  }

  atRule.remove()

  // check if parent has anything
  if (parent && !parent.nodes.length) {
    parent.remove()
  }
}

function createFlexDecls(flexDecls, flexSize) {
  let maxWidth

  if (flexSize.includes('vw') && FIX_FIREFOX_FLEX_VW_BUG) {
    maxWidth = reduceCSSCalc(`calc(${flexSize} - 0.002vw)`, 6)
  } else {
    maxWidth = flexSize
  }
  flexDecls.push(buildDecl('position', 'relative'))
  flexDecls.push(buildDecl('flex-grow', '0'))
  flexDecls.push(buildDecl('flex-shrink', '0'))
  flexDecls.push(buildDecl('flex-basis', flexSize))
  flexDecls.push(buildDecl('max-width', maxWidth))
}
