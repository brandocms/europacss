import _ from 'lodash'
import postcss from 'postcss'
import buildDecl from '../../util/buildDecl'

/**
 * Aliases and shortcuts to other at-rules
 */
module.exports = getConfig => {
  const config = getConfig()

  return {
    postcssPlugin: 'europacss-font',
    prepare() {
      return {
        AtRule: {
          font: atRule => {
            processRule(atRule, config)
          }
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule, config) {
  const parent = atRule.parent
  if (parent.type === 'root') {
    throw atRule.error(`FONT: Can only be used inside a rule, not on root.`)
  }

  if (atRule.nodes) {
    throw atRule.error(`FONT: @font should not include children.`)
  }

  let [family, fsQuery, bpQuery] = postcss.list.space(atRule.params)

  const fsParams = fsQuery ? fsQuery + (bpQuery ? ' ' + bpQuery : '') : null

  // Try to resolve the family as-is (which may include slashes for hierarchical keys)
  let ff = config.theme.typography.families[family]

  // If not found and contains slash, try path traversal
  if (!ff && family.includes('/')) {
    const pathParts = family.split('/')
    ff = _.get(config.theme.typography.families, pathParts)
  }

  if (!ff) {
    throw atRule.error(`FONT: Could not find \`${family}\` in typography.families config`)
  }

  if (ff.length) {
    ff = ff.join(',')
  }

  const decls = [buildDecl('font-family', ff)]

  if (fsParams) {
    // insert a @fontsize at rule after this
    const fsRule = postcss.atRule({ name: 'fontsize', params: fsParams })
    fsRule.source = atRule.source
    parent.insertBefore(atRule, fsRule)
  }

  parent.append(...decls)
  atRule.remove()
}
