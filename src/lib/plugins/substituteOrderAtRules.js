import _ from 'lodash'
import postcss from 'postcss'
import buildDecl from '../../util/buildDecl'
import findResponsiveParent from '../../util/findResponsiveParent'

/**
 * A shortcut for responsive order rules
 */
module.exports = () => {
  return {
    postcssPlugin: 'europacss-order',
    prepare({ root }) {
      return {
        AtRule: {
          order: atRule => processRule(atRule)
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule) {
  const src = atRule.source
  let wrapInResponsive = false
  const parent = atRule.parent

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
  // accept a query param for @order
  const responsiveParent = findResponsiveParent(atRule)
  if (responsiveParent) {
    if (bpQuery) {
      throw clonedRule.error(
        `ORDER: When nesting @order under @responsive, we do not accept a breakpoints query.`,
        { name: bpQuery }
      )
    }

    bpQuery = responsiveParent.params
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
}
