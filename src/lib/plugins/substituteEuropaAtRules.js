import fs from 'fs'
import _ from 'lodash'
import postcss from 'postcss'
import updateSource from '../../util/updateSource'

module.exports = getConfig => {
  const config = getConfig()

  /* TODO: Can we wrap all the generated css here with some special comment syntax, that
     will signal to the mq packer and rule packer to leave this alone at the TOP of the file?
  */

  return {
    postcssPlugin: 'europacss-europa',
    prepare({ root }) {
      return {
        OnceExit() {
          console.log('=> OnceExit — @europa')
        },
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
