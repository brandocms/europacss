import _ from 'lodash'
import postcss from 'postcss'
import fs from 'fs'
import buildDecl from '../../util/buildDecl'
import updateSource from '../../util/updateSource'
import reduceCSSCalc from 'reduce-css-calc'

/**
 * Embed responsive
 */

module.exports = getConfig => {
  const config = getConfig()

  return {
    postcssPlugin: 'europacss-embed-responsive',
    prepare() {
      return {
        AtRule: {
          'embed-responsive': atRule => {
            processRule(atRule, config, false)
          }
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule, _config, _flagAsImportant) {
  const src = atRule.source

  if (atRule.parent.type === 'root') {
    throw atRule.error(`EMBED-RESPONSIVE: Can only be used inside a rule, not on root.`)
  }

  if (!atRule.params) {
    throw atRule.error(`EMBED-RESPONSIVE: Needs aspect ratio. I.e: @embed-responsive 16/9;`)
  }

  const ratio = atRule.params.split('/')

  const decls = [
    buildDecl(
      'padding-top',
      reduceCSSCalc(`calc(${parseFloat(ratio[1])}/${parseFloat(ratio[0])}*100`) + '%'
    )
  ]
  // create a :before rule
  const pseudoBefore = postcss.rule({ selector: '&::before' })
  pseudoBefore.source = src
  atRule.parent.insertAfter(atRule, pseudoBefore.append(...decls))

  const embedPath = `${__dirname}/css/embed-responsive.css`
  const styles = postcss.parse(fs.readFileSync(embedPath, 'utf8'), { from: embedPath })
  atRule.parent.insertAfter(atRule, updateSource([...styles.nodes], src))
  atRule.remove()
}
