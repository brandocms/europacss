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
              const normalizePath = require.resolve('normalize.css')
              const normalizeStyles = postcss.parse(
                fs.readFileSync(normalizePath, 'utf8'),
                { from: normalizePath }
              )
              const basePath = `${__dirname}/css/base.css`
              const baseStyles = postcss.parse(
                fs.readFileSync(basePath, 'utf8'),
                { from: basePath }
              )
              prepend(
                root,
                updateSource([...normalizeStyles.nodes, ...baseStyles.nodes], atRule.source)
              )
              atRule.remove()
            } else if (atRule.params === 'arrows') {
              const arrowsPath = `${__dirname}/css/arrows.css`
              const styles = postcss.parse(fs.readFileSync(arrowsPath, 'utf8'), { from: arrowsPath })
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
