import _ from 'lodash'
import postcss from 'postcss'
import buildDecl from '../../util/buildDecl'

/**
 * Display. Basically a shortcut for responsive order rules
 */

export default postcss.plugin('europacss-order', getConfig => {
  const config = getConfig()
  const {
    theme: { breakpoints, breakpointCollections }
  } = config

  return function (css) {
    const finalRules = []

    css.walkAtRules('order', atRule => {
      const src = atRule.source
      let selector
      let wrapInResponsive = false
      let wrapRow = 'nowrap'
      let gap = null
      const parent = atRule.parent
      let grandParent = atRule.parent.parent

      if (parent.type === 'root') {
        throw atRule.error(`ORDER: Can only be used inside a rule, not on root.`)
      }

      if (atRule.nodes) {
        throw atRule.error(`ORDER: @order should not include children.`)
      }

      let [order = null, bpQuery = null] = postcss.list.space(atRule.params)

      if (bpQuery) {
        wrapInResponsive = true
      }

      let clonedRule = atRule.clone()

      // Check if we're nested under a @responsive rule.
      // If so, we don't create a media query, and we also won't
      // accept a query param for @space
      if (parent.type === 'atrule' && parent.name === 'responsive') {
        if (bpQuery) {
          throw clonedRule.error(
            `ORDER: When nesting @order under @responsive, we do not accept a breakpoints query.`,
            { name: bpQuery }
          )
        }

        bpQuery = parent.params

        console.log('grandParent.selector ——', grandParent.selector)
        console.log('parent.selector ——', parent.selector)

        if (grandParent.selector) {
          selector = grandParent.selector
        }
      } else if (grandParent.name === 'responsive') {
        // check if grandparent is @responsive
        if (bpQuery) {
          throw clonedRule.error(
            `ORDER: When nesting @order under @responsive, we do not accept a breakpoints query.`,
            { name: bpQuery }
          )
        }

        bpQuery = grandParent.params

        console.log('parent.selector —— is it &?', parent.selector)

        if (parent.selector[0] === '&') {
          selector = parent.selector.replace('&', grandParent.parent.selector)
        } else {
          selector = parent.selector
        }
      }

      if (!selector && parent.selector) {
        selector = parent.selector
      }

      const decls = [buildDecl('order', order)]

      if (wrapInResponsive) {
        const responsiveRule = postcss.atRule({ name: 'responsive', params: bpQuery })
        responsiveRule.source = src
        responsiveRule.append(...decls)
        parent.insertBefore(atRule, responsiveRule)
      } else {
        parent.prepend(...decls)
      }

      atRule.remove()
    })
  }
})
