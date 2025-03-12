import _ from 'lodash'

import postcssNested from 'postcss-nested'
import postcssExtend from '@outstand/postcss-extend-rule'

import defaultConfig from '../stubs/defaultConfig'
import resolveConfig from './util/resolveConfig'
import registerConfigAsDependency from './lib/registerConfigAsDependency'
import formatCSS from './lib/formatCSS'
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

/**
 *
 * TODO
 *
 * kan vi gjøre samme som tw har gjort med @extend? dvs vi kaller den først med sync,
 * så alle pluginsene våre etterpå?
 *
 * https://github.com/postcss/postcss/issues/1712
 * https://github.com/tailwindlabs/tailwindcss/blob/v3/src/postcss-plugins/nesting/plugin.js
 *
 */

module.exports = config => {
  const resolvedConfigPath = resolveConfigPath(config)
  const cfgFunction = getConfigFunction(resolvedConfigPath || config)

  const preludium = [postcssExtend(), postcssNested({ bubble: ['responsive'] })]

  const configuredEuropaPlugins = plugins.map(plug => {
    return plug(cfgFunction)
  })

  const pipeline = [...preludium, ...configuredEuropaPlugins]

  if (!_.isUndefined(resolvedConfigPath)) {
    pipeline.push(registerConfigAsDependency(resolvedConfigPath))
  }

  return {
    postcssPlugin: 'europacss',
    plugins: [...pipeline]
  }
}

module.exports.postcss = true
