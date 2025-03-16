import _ from 'lodash'

import postcss from 'postcss'
import postcssNested from 'postcss-nested'
import postcssNesting from 'postcss-nesting'
import postcssPresetEnv from 'postcss-preset-env'
import postcssExtendRule from './lib/plugins/extend'
import postcssCombineDuplicatedSelectors from 'postcss-combine-duplicated-selectors'
import postcssMQPacker from './lib/plugins/postcss/mqpacker'

import defaultConfig from '../stubs/defaultConfig'
import resolveConfig from './util/resolveConfig'
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
  // Extract the europacss config and presetEnv options
  let europacssConfig = config
  let presetEnvOptions = {}

  // If config is an object and has presetEnv property, extract it
  if (_.isObject(config) && !_.isUndefined(config.presetEnv)) {
    presetEnvOptions = config.presetEnv

    // If the config also has an actual europacss config, use that
    if (!_.isUndefined(config.config)) {
      europacssConfig = config.config
    } else {
      // Otherwise, use config without the presetEnv prop
      europacssConfig = _.omit(config, ['presetEnv'])
    }
  }

  // if europacssConfig is empty, set it as undefined
  if (_.isEmpty(europacssConfig)) {
    europacssConfig = undefined
  }

  const resolvedConfigPath = resolveConfigPath(europacssConfig)
  const cfgFunction = getConfigFunction(resolvedConfigPath || europacssConfig)

  // Extract options for postcss-preset-env
  const usePresetEnv = _.get(presetEnvOptions, 'disable', false) !== true
  
  // Default preset-env options
  const defaultPresetEnvOptions = {
    browsers: ['defaults'],
    features: {
      'custom-properties': false,
    },
  }
  
  // Merge default options with user-provided options
  const presetEnvConfig = _.merge(
    {},
    defaultPresetEnvOptions,
    _.omit(presetEnvOptions, ['disable'])
  )

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

          if (
            plugin.postcssPlugin === 'css-mqgroup' ||
            plugin.postcssPlugin === 'europacss-mqpacker'
          ) {
            throw new Error(
              'europacss runs its own media query packing plugin. please remove css-mqgroup or europacss-mqpacker from your config'
            )
          }

          if (plugin.postcssPlugin === 'postcss-combine-duplicated-selectors') {
            throw new Error(
              'europacss runs its own selector deduping plugin. please remove postcss-combine-duplicated-selectors from your config'
            )
          }

          if (plugin.postcssPlugin === 'postcss-preset-env') {
            throw new Error(
              'europacss runs its own postcss-preset-env plugin. please remove postcss-preset-env from your config and pass options via europacss instead'
            )
          }

          if (plugin.postcssPlugin === 'autoprefixer') {
            throw new Error(
              'europacss runs postcss-preset-env which includes autoprefixer. please remove autoprefixer from your config'
            )
          }
        }

        if (resolvedConfigPath) {
          result.messages.push({
            type: 'dependency',
            file: resolvedConfigPath,
            parent: root.source.input.file
          })
        }

        // run nesting
        result = await postcss([postcssNested({ bubble: ['responsive'] })]).process(
          root,
          result.opts
        )

        // then @extend all classes
        result = await postcss([postcssExtendRule()]).process(root, result.opts)

        // then we blast through the europaPipeline
        const configuredEuropaPlugins = plugins.map(plug => {
          return plug(cfgFunction)
        })

        const europaPipeline = [...configuredEuropaPlugins]
        result = await postcss(europaPipeline).process(root, result.opts)

        // try to lose all @nest garbage
        result = await postcss([
          postcssNesting({
            edition: '2021',
            noIsPseudoSelector: true
          })
        ]).process(root, result.opts)

        // then we run nesting again
        result = await postcss([postcssNested()]).process(root, result.opts)

        // Use our custom media query packer with mobile-first sorting
        result = await postcss([postcssMQPacker({ sort: true })]).process(root, result.opts)

        // then finally combine selectors
        result = await postcss([postcssCombineDuplicatedSelectors()]).process(root, result.opts)

        // Apply postcss-preset-env if enabled
        if (usePresetEnv) {
          result = await postcss([postcssPresetEnv(presetEnvConfig)]).process(root, result.opts)
        }
      }
    ]
  }
}

module.exports.postcss = true
