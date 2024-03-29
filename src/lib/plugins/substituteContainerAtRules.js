
import _ from 'lodash'
import buildMediaQuery from '../../util/buildMediaQuery'
import buildMediaQueryQ from '../../util/buildMediaQueryQ'
import postcss from 'postcss'
import extractBreakpointKeys from '../../util/extractBreakpointKeys';
import buildDecl from '../../util/buildDecl'

/**
 * CONTAINER
 *
 * Examples:
 *
 *    @container;
 *
 */

export default postcss.plugin('europacss-container', getConfig => {
  return function (css, result) {
    const { theme: { breakpoints, breakpointCollections, container } } = getConfig()
    const finalRules = []

    css.walkAtRules('container', atRule => {
      let needsMediaRule = true
      let affectedBreakpoints
      let exact = false
      const parent = atRule.parent
      const src = atRule.source

      atRule.warn(
        result,
        `DEPRECATED: @container is deprecated. Use \`@space container;\` instead`,
        {
          name: '@container',
          plugin: 'europacss'
        }
      )

      if (atRule.parent.type === 'root') {
        throw atRule.error(`CONTAINER: Can only be used inside a rule, not on root.`)
      }

      if (atRule.nodes) {
        throw atRule.error(`CONTAINER: Container should not include children.`)
      }

      // if we have a q, like '>=sm'. Extract all breakpoints we need media queries for
      let q = atRule.params

      // Check if we're nested under a @responsive rule.
      // If so, we don't create a media query, and we also won't
      // accept a query param for @space
      if (parent.type === 'atrule' && parent.name === 'responsive') {
        if (q) {
          throw atRule.error(`CONTAINER: When nesting @container under @responsive, we do not accept a breakpoints query.`, { name: q })
        }
        q = parent.params
        needsMediaRule = false
      }

      // what if the parent's parent is @responsive?
      if (!['atrule', 'root'].includes(parent.type) && parent.parent.type === 'atrule' && parent.parent.name === 'responsive') {
        if (q) {
          throw atRule.error(`CONTAINER: When nesting @container under @responsive, we do not accept a breakpoints query.`, { name: q })
        }
        q = parent.parent.params
        needsMediaRule = false
      }

      if (q) {
        affectedBreakpoints = extractBreakpointKeys({ breakpoints, breakpointCollections }, q)
        exact = true
      } else {
        affectedBreakpoints = _.keys(breakpoints)
      }

      // build media queries
      affectedBreakpoints.forEach(bp => {
        if (!_.has(container.padding, bp)) {
          throw atRule.error(`CONTAINER: No \`${bp}\` breakpoint found in \`container.padding\`.`)
        }

        if (!_.has(container.maxWidth, bp)) {
          throw atRule.error(`CONTAINER: No \`${bp}\` breakpoint found in \`container.padding\`.`)
        }

        const paddingValue = container.padding[bp]
        const containerDecl = buildDecl('padding-x', paddingValue)
        const maxWidthValue = container.maxWidth[bp]
        const containerMaxWidthDecl = buildDecl('max-width', maxWidthValue)

        const containerMarginDecl = buildDecl('margin-x', 'auto')
        const containerWidthDecl = buildDecl('width', '100%')

        if (needsMediaRule) {
          const mediaRule = postcss.atRule({ name: 'media', params: exact ? buildMediaQueryQ({ breakpoints, breakpointCollections }, bp) : buildMediaQuery(breakpoints, bp) })
          const originalRule = postcss.rule({ selector: parent.selector })
          originalRule.source = src

          originalRule.append(containerDecl)
          originalRule.append(containerMaxWidthDecl)
          originalRule.append(containerMarginDecl)
          originalRule.append(containerWidthDecl)
          mediaRule.append(originalRule)
          finalRules.push(mediaRule)
        } else {
          parent.append(containerDecl)
          parent.append(containerMaxWidthDecl)
          parent.append(containerMarginDecl)
          parent.append(containerWidthDecl)
        }
      })

      parent.after(finalRules)
      atRule.remove()

      // check if parent has anything
      if (parent && !parent.nodes.length) {
        parent.remove()
      }
    })
  }
})