import _ from 'lodash'
import cloneNodes from '../../util/cloneNodes'

module.exports = getConfig => {
  const config = getConfig()

  return {
    postcssPlugin: 'europacss-if',
    prepare() {
      return {
        AtRule: {
          if: atRule => {
            processRule(atRule, config)
          }
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule, config) {
  const nodes = atRule.nodes
  if (!nodes) {
    throw atRule.error(`IF: Must include child nodes.`, { word: 'if' })
  }

  const params = atRule.params
  if (!params) {
    throw atRule.error(`IF: Must include breakpoint selectors`, { word: 'if' })
  }

  // get the key
  const path = params.split('.')

  const obj = _.get(config, path)
  if (obj === undefined) {
    throw atRule.error(`IF: not found: \`${params}\``, { word: params })
  }

  if (obj) {
    atRule.parent.append(...cloneNodes(nodes))
  }

  atRule.remove()
}
