import _, { after } from 'lodash'
import buildFullMediaQuery from '../../util/buildFullMediaQuery'
import buildMediaQueryQ from '../../util/buildMediaQueryQ'
import postcss from 'postcss'
import extractBreakpointKeys from '../../util/extractBreakpointKeys'
import buildDecl from '../../util/buildDecl'
import parseFontSizeQuery from '../../util/parseFontSizeQuery'
import findResponsiveParent from '../../util/findResponsiveParent'

/**
 * FONTSIZE
 *
 * @param {fontSizeQuery} - size of font + optional adjustment + optional line height
 * @param [breakpoint]    - if this should only apply to ONE breakpoint
 *
 * Examples:
 *
 *    @fontsize xl;
 *    @fontsize xl(0.8)/2.1;
 *    @fontsize xl >md;
 *
 */

module.exports = getConfig => {
  const config = getConfig()

  return {
    postcssPlugin: 'europacss-fontsize',
    prepare({ root }) {
      return {
        AtRule: {
          fontsize: atRule => processRule(atRule, config)
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule, config) {
  const { theme } = config
  const { breakpoints, breakpointCollections, spacing } = theme

  const src = atRule.source

  if (atRule.parent.type === 'root') {
    throw atRule.error(`FONTSIZE: Can only be used inside a rule, not on root.`)
  }

  if (atRule.nodes) {
    throw atRule.error(`FONTSIZE: @fontsize should not include children.`)
  }

  // clone parent, but without atRule
  let clonedRule = atRule.clone()
  let [fontSizeQuery, bpQuery] = postcss.list.space(clonedRule.params)
  let parent = atRule.parent
  let responsiveParent = findResponsiveParent(atRule)

  // Check if we're nested under a @responsive rule.
  // If so, we don't create a media query, and we also won't
  // accept a query param for @fontsize
  if (responsiveParent) {
    if (bpQuery) {
      throw clonedRule.error(
        `FONTSIZE: When nesting @fontsize under @responsive, we do not accept a breakpoints query.`,
        { name: bpQuery }
      )
    }

    bpQuery = responsiveParent.__mediaQuery
  }

  if (bpQuery) {
    // We have a q, like '>=sm'. Extract all breakpoints we need media queries for
    const affectedBreakpoints = extractBreakpointKeys(
      { breakpoints, breakpointCollections },
      bpQuery
    )

    _.each(affectedBreakpoints, bp => {
      let parsedFontSizeQuery = parseFontSizeQuery(clonedRule, config, fontSizeQuery, bp)
      const fontDecls = _.keys(parsedFontSizeQuery).map(prop =>
        buildDecl(prop, parsedFontSizeQuery[prop])
      )

      const mediaRule = clonedRule.clone({
        name: 'media',
        params: buildMediaQueryQ({ breakpoints, breakpointCollections }, bp)
      })

      mediaRule.append(...fontDecls)
      mediaRule.source = src
      atRule.before(mediaRule)
    })
  } else {
    _.keys(breakpoints).forEach(bp => {
      let parsedFontSizeQuery = parseFontSizeQuery(clonedRule, config, fontSizeQuery, bp)
      const fontDecls = _.keys(parsedFontSizeQuery).map(prop =>
        buildDecl(prop, parsedFontSizeQuery[prop])
      )
      const mediaRule = clonedRule.clone({
        name: 'media',
        params: buildFullMediaQuery(breakpoints, bp)
      })

      mediaRule.append(...fontDecls)
      mediaRule.source = src
      atRule.before(mediaRule)
    })
  }

  atRule.remove()

  // check if parent has anything
  if (parent && !parent.nodes.length) {
    parent.remove()
  }
}
