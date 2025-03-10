import _ from 'lodash'

import postcssNested from 'postcss-nested'
import postcssExtend from 'postcss-extend-rule'

import defaultConfig from '../stubs/defaultConfig'
import resolveConfig from './util/resolveConfig'
import registerConfigAsDependency from './lib/registerConfigAsDependency'
import formatCSS from './lib/formatCSS'
import resolveConfigPath from './util/resolveConfigPath'
import plugins from './lib/plugins'
import substituteRowAtRules from './lib/plugins/substituteRowAtRules'

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
  const resolvedConfigPath = resolveConfigPath(config)
  const cfgFunction = getConfigFunction(resolvedConfigPath || config)

  const preludium = [substituteRowAtRules(cfgFunction), postcssNested(), postcssExtend()]

  const postludium = [postcssNested(), formatCSS]

  const configuredEuropaPlugins = plugins.map(plug => {
    return plug(cfgFunction)
  })

  const pipeline = [...preludium, ...configuredEuropaPlugins, ...postludium]

  if (!_.isUndefined(resolvedConfigPath)) {
    pipeline.push(registerConfigAsDependency(resolvedConfigPath))
  }

  return {
    postcssPlugin: 'europacss',
    plugins: [...pipeline]
  }
}

module.exports.postcss = true
