import _ from 'lodash'
import buildMediaQueryQ from '../../util/buildMediaQueryQ'

module.exports = getConfig => {
  const config = getConfig()
  const finalRules = []

  return {
    postcssPlugin: 'europacss-responsive',
    prepare() {
      return {
        AtRule: {
          responsive: atRule => {
            processRule(atRule, config, finalRules)
          }
        },
        OnceExit() {
          console.log('=> OnceExit — @responsive')
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule, config, _finalRules, _flagAsImportant) {
  const {
    theme: { breakpoints, breakpointCollections }
  } = config

  if (!atRule.params) {
    throw atRule.error(`RESPONSIVE: Must include breakpoint selectors`, {
      word: 'responsive'
    })
  }
  // Build the media query string from the params
  const mediaQuery = buildMediaQueryQ({ breakpoints, breakpointCollections }, atRule.params)

  // Rename the rule and update its parameters
  atRule.name = 'media'
  atRule.__mediaQuery = atRule.params
  atRule.params = mediaQuery
  atRule.__isResponsive = true
}
