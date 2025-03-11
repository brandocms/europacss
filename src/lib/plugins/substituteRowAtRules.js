import postcss from 'postcss'

module.exports = getConfig => {
  return {
    postcssPlugin: 'europacss-row',
    prepare() {
      return {
        AtRule: {
          row: atRule => {
            processRule(atRule)
          }
        }
      }
    }
  }
}

module.exports.postcss = true

function processRule(atRule) {
  throw atRule.error(`ROW: Deprecated. Use @space column-gap 1 and @space row-gap 1 instead.`)
}
