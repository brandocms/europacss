import _ from 'lodash'

import postcss from 'postcss'
import postcssNested from 'postcss-nested'
import postcssNesting from 'postcss-nesting'
// import postcssExtendRule from 'postcss-extend-rule'
// import postcssExtendRule from '@outstand/postcss-extend-rule'
import postcssExtendRule from './lib/plugins/extend'
import postcssCombineDuplicatedSelectors from 'postcss-combine-duplicated-selectors'
import postcssMQGroup from 'css-mqgroup'

import defaultConfig from '../stubs/defaultConfig'
import resolveConfig from './util/resolveConfig'
import registerConfigAsDependency from './lib/registerConfigAsDependency'
import resolveConfigPath from './util/resolveConfigPath'
import plugins from './lib/plugins'

const getConfigFunction = config => () => {
  if (_.isUndefined(config) && !_.isObject(config)) {
    return resolveConfig([defaultConfig])
  }

  if (!_.isObject(config)) {
    delete require.cache[require.resolve(config)]
  }

  return resolveConfig([_.isObject(config) ? config : require(config), defaultConfig])
}

module.exports = config => {
  console.log('SOURCE, NOT BUILT! :)')
  const resolvedConfigPath = resolveConfigPath(config)
  const cfgFunction = getConfigFunction(resolvedConfigPath || config)

  const configuredEuropaPlugins = plugins.map(plug => {
    return plug(cfgFunction)
  })

  const europaPipeline = [...configuredEuropaPlugins]

  if (!_.isUndefined(resolvedConfigPath)) {
    europaPipeline.push(registerConfigAsDependency(resolvedConfigPath))
  }

  return {
    postcssPlugin: 'europacss',
    plugins: [
      async function (root, result) {
        for (let plugin of result.processor.plugins) {
          if (plugin.postcssPlugin === 'postcss-nested') {
            throw new Error(
              'europacss runs its own nesting plugin. please remove postcss-nested from your config'
            )
          }

          if (plugin.postcssPlugin === 'postcss-mqpacker') {
            throw new Error(
              'europacss runs its own media query packing plugin. please remove postcss-mqpacker from your config'
            )
          }

          if (plugin.postcssPlugin === '@hail2u/css-mqpacker') {
            throw new Error(
              'europacss runs its own media query packing plugin. please remove @hail2u/css-mqpacker from your config'
            )
          }

          if (plugin.postcssPlugin === 'css-mqgroup') {
            throw new Error(
              'europacss runs its own media query packing plugin. please remove css-mqgroup from your config'
            )
          }

          if (plugin.postcssPlugin === 'postcss-combine-duplicated-selectors') {
            throw new Error(
              'europacss runs its own selector deduping plugin. please remove postcss-combine-duplicated-selectors from your config'
            )
          }
        }

        // run nesting
        result = await postcss([postcssNested({ bubble: ['responsive'] })]).process(
          root,
          result.opts
        )

        // then @extend all classes
        console.log('extend!')
        result = await postcss([postcssExtendRule()]).process(root, result.opts)

        // then we blast through the europaPipeline
        result = await postcss(europaPipeline).process(root, result.opts)

        // try to lose all @nest garbage
        result = await postcss([postcssNesting()]).process(root, result.opts)

        // then we run nesting again
        result = await postcss([postcssNested()]).process(root, result.opts)

        // then we sort mqs
        result = await postcss([postcssMQGroup({ sort: true })]).process(root, result.opts)

        // then finally combine selectors
        result = await postcss([postcssCombineDuplicatedSelectors()]).process(root, result.opts)
      }
    ]
  }
}

module.exports.postcss = true
