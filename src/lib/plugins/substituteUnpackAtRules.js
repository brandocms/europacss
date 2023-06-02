import _ from 'lodash'
import postcss from 'postcss'
import buildDecl from '../../util/buildDecl'

export default postcss.plugin('europacss-unpack', getConfig => {
  return function (css) {
    const config = getConfig()
    const finalRules = []

    css.walkAtRules('unpack', atRule => {
      const src = atRule.source
      const parent = atRule.parent

      const params = atRule.params
      if (!params) {
        throw atRule.error(`UNPACK: Must include iterable parameter`, { word: 'unpack' })
      }

      if (params === 'containerPadding') {
        // unpack container values to css vars
        const obj = _.get(config, ['theme', 'container', 'padding'])
        if (!obj) {
          throw atRule.error(`UNPACK: iterable not found: \`${params}\``, { word: params })
        }

        // iterate through breakpoints
        _.keys(obj).forEach(breakpoint => {
          let value = obj[breakpoint]

          // build decls for each k/v
          const decls = [buildDecl('--container-padding', value)]

          // build a responsive rule with these decls
          const responsiveRule = postcss.atRule({ name: 'responsive', params: breakpoint })
          responsiveRule.source = src
          responsiveRule.append(...decls)
          atRule.parent.append(responsiveRule)
        })
        atRule.remove()
        return
      }

      if (params === 'gridGutter') {
        // unpack container values to css vars
        const obj = _.get(config, ['theme', 'columns', 'gutters'])
        if (!obj) {
          throw atRule.error(`UNPACK: iterable not found: \`${params}\``, { word: params })
        }

        // iterate through breakpoints
        _.keys(obj).forEach(breakpoint => {
          let value = obj[breakpoint]

          // build decls for each k/v
          const decls = [buildDecl('--grid-gutter', value)]

          // build a responsive rule with these decls
          const responsiveRule = postcss.atRule({ name: 'responsive', params: breakpoint })
          responsiveRule.source = src
          responsiveRule.append(...decls)
          atRule.parent.append(responsiveRule)
        })
        atRule.remove()
        return
      }

      if (params.indexOf('.') === -1) {
        throw atRule.error(`UNPACK: Can't unpack theme object. Supply a path: \`spacing.md\``, {
          word: 'unpack'
        })
      }

      if (parent.type === 'root') {
        throw atRule.error(`UNPACK: Cannot run from root`, { word: 'unpack' })
      }

      // get the wanted object
      const path = params.split('.')
      const obj = _.get(config, path)
      if (!obj) {
        throw atRule.error(`UNPACK: iterable not found: \`${params}\``, { word: params })
      }

      if (typeof obj !== 'object') {
        throw atRule.error(`UNPACK: iterable must be an object of breakpoints \`${params}\``, {
          word: params
        })
      }

      // iterate through breakpoints
      _.keys(obj).forEach(breakpoint => {
        let values = obj[breakpoint]

        // build decls for each k/v
        const decls = []

        _.keys(values).forEach(prop => {
          decls.push(buildDecl(prop, values[prop]))
        })

        // build a responsive rule with these decls
        const responsiveRule = postcss.atRule({ name: 'responsive', params: `>=${breakpoint}` })
        responsiveRule.source = src
        responsiveRule.append(...decls)
        atRule.parent.append(responsiveRule)
      })
      atRule.remove()
    })
  }
})
