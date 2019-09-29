
import _ from 'lodash'
import postcss from 'postcss'
import fs from 'fs'
import buildDecl from '../../util/buildDecl'
import updateSource from '../../util/updateSource'
import reduceCSSCalc from 'reduce-css-calc'

/**
 * Aliases and shortcuts to other at-rules
 */

export default postcss.plugin('europacss-embed-responsive', getConfig => {
  return function (css) {
    css.walkAtRules('embed-responsive', atRule => {
      if (atRule.parent.type === 'root') {
        throw atRule.error(`EMBED-RESPONSIVE: Can only be used inside a rule, not on root.`)
      }

      if (!atRule.params) {
        throw atRule.error(`EMBED-RESPONSIVE: Needs aspect ratio. I.e: @embed-responsive 16/9;`)
      }

      const ratio = atRule.params.split('/')

      const decls = [
        buildDecl('padding-top', reduceCSSCalc(`calc(${parseFloat(ratio[1])}/${parseFloat(ratio[0])}*100`) + '%')
      ]
      // create a :before rule
      const pseudoBefore = postcss.rule({ selector: '&::before' })
      atRule.parent.insertAfter(atRule, pseudoBefore.append(...decls))

      const styles = postcss.parse(fs.readFileSync(`${__dirname}/css/embed-responsive.css`, 'utf8'))
      atRule.parent.insertAfter(atRule, updateSource([...styles.nodes]))
      atRule.remove()
    })
  }
})
