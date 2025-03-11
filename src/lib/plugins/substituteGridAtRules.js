import _ from 'lodash'
import buildDecl from '../../util/buildDecl'

/**
 * A simple shortcut for setting up a grid.
 * Sets column gap to gutter width across all breakpoints
 */

module.exports = getConfig => {
  const config = getConfig()

  return {
    postcssPlugin: 'europacss-grid',
    prepare() {
      return {
        AtRule: {
          grid: atRule => {
            processRule(atRule)
          }
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule) {
  const gridDecl = buildDecl('display', 'grid')
  const gridTplDecl = buildDecl('grid-template-columns', 'repeat(12, 1fr)')
  atRule.name = 'space'
  atRule.params = 'grid-column-gap 1'
  atRule.parent.insertBefore(atRule, gridDecl)
  atRule.parent.insertBefore(atRule, gridTplDecl)
}
