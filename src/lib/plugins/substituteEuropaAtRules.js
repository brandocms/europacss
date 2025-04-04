import fs from 'fs'
import _ from 'lodash'
import postcss from 'postcss'
import updateSource from '../../util/updateSource'

module.exports = getConfig => {
  return {
    postcssPlugin: 'europacss-europa',
    prepare({ root }) {
      return {
        AtRule: {
          europa: atRule => {
            if (atRule.params === 'base') {
              const normalizeStyles = postcss.parse(
                fs.readFileSync(require.resolve('normalize.css'), 'utf8')
              )
              const baseStyles = postcss.parse(
                fs.readFileSync(`${__dirname}/css/base.css`, 'utf8')
              )
              prepend(
                root,
                updateSource([...normalizeStyles.nodes, ...baseStyles.nodes], atRule.source)
              )
              atRule.remove()
            } else if (atRule.params === 'arrows') {
              const styles = postcss.parse(fs.readFileSync(`${__dirname}/css/arrows.css`, 'utf8'))
              prepend(root, updateSource([...styles.nodes], atRule.source))
              atRule.remove()
            }
          }
        }
      }
    }
  }
}

module.exports.postcss = true

function prepend(css, styles) {
  css.prepend(styles)
}
