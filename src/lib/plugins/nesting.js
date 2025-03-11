import postcss from 'postcss'
import postcssNested from 'postcss-nested'

export function nesting(getConfig) {
  const config = getConfig()
  return (root, result) => {
    root.walkAtRules('responsive', rule => {
      const {
        theme: { breakpoints, breakpointCollections }
      } = config

      if (!rule.params) {
        throw rule.error(`RESPONSIVE: Must include breakpoint selectors`, {
          word: 'responsive'
        })
      }
      // Build the media query string from the params
      const mediaQuery = buildMediaQueryQ({ breakpoints, breakpointCollections }, atRule.params)

      // Rename the rule and update its parameters
      rule.name = 'media'
      rule.__mediaQuery = rule.params
      rule.params = mediaQuery
      rule.__isResponsive = true
    })

    root.walkAtRules('extend', rule => {
      rule.before(postcss.decl({ prop: '__extend', value: rule.params, source: rule.source }))
      rule.remove()
    })

    postcss([postcssNested]).process(root, result.opts).sync()

    root.walkDecls('__extend', decl => {
      decl.before(postcss.atRule({ name: 'extend', params: decl.value, source: decl.source }))
      decl.remove()
    })

    /**
     * Use a private PostCSS API to remove the "clean" flag from the entire AST.
     * This is done because running process() on the AST will set the "clean"
     * flag on all nodes, which we don't want.
     *
     * This causes downstream plugins using the visitor API to be skipped.
     *
     * This is guarded because the PostCSS API is not public
     * and may change in future versions of PostCSS.
     *
     * See https://github.com/postcss/postcss/issues/1712 for more details
     */
    function markDirty(node) {
      if (!('markDirty' in node)) {
        return
      }

      // Traverse the tree down to the leaf nodes
      if (node.nodes) {
        node.nodes.forEach(n => markDirty(n))
      }

      // If it's a leaf node mark it as dirty
      // We do this here because marking a node as dirty
      // will walk up the tree and mark all parents as dirty
      // resulting in a lot of unnecessary work if we did this
      // for every single node
      if (!node.nodes) {
        node.markDirty()
      }
    }

    markDirty(root)

    return root
  }
}
