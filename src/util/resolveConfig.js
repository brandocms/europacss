import mergeWith from 'lodash/mergeWith'
import isFunction from 'lodash/isFunction'
import defaults from 'lodash/defaults'
import map from 'lodash/map'
import toPath from 'lodash/toPath'

/**
 * Configuration utility functions available to theme resolvers
 */
const configUtils = {
  /**
   * Create negative versions of a scale
   * @param {Object} scale - Scale object with values
   * @returns {Object} New object with negative versions of values
   */
  negative(scale) {
    return Object.keys(scale)
      .filter(key => scale[key] !== '0')
      .reduce(
        (negativeScale, key) => ({
          ...negativeScale,
          [`-${key}`]: `-${scale[key]}`
        }),
        {}
      )
  }
}

/**
 * Resolve a value or function with provided arguments
 * @param {*} valueToResolve - Value or function to resolve
 * @param  {...any} args - Arguments to pass to function
 * @returns {*} Resolved value
 */
function value(valueToResolve, ...args) {
  return isFunction(valueToResolve) ? valueToResolve(...args) : valueToResolve
}

/**
 * Merge theme extensions with base theme
 * @param {Object} theme - Theme object with possible extend property
 * @returns {Object} Merged theme
 */
function mergeExtensions({ extend, ...theme }) {
  return mergeWith(theme, extend, (themeValue, extensions) => {
    // If both are not functions, merge objects normally
    if (!isFunction(themeValue) && !isFunction(extensions)) {
      return {
        ...themeValue,
        ...extensions
      }
    }

    // If one or both are functions, return a new function that merges the results
    return (resolveThemePath, utils) => ({
      ...value(themeValue, resolveThemePath, utils),
      ...value(extensions, resolveThemePath, utils)
    })
  })
}

/**
 * Resolve all function values in an object with a theme path resolver
 * @param {Object} object - Object with possible function values
 * @returns {Object} Object with resolved values
 */
function resolveFunctionKeys(object) {
  /**
   * Internal function to resolve a theme path to a value
   * @param {String} key - Theme path key
   * @param {*} defaultValue - Default value if path not found
   * @returns {*} Resolved value
   */
  const resolveThemePath = (key, defaultValue) => {
    const path = toPath(key)
    
    let index = 0
    let val = object
    
    // Navigate down the path
    while (val !== undefined && val !== null && index < path.length) {
      val = val[path[index++]]
      // Resolve if value is a function
      val = isFunction(val) ? val(resolveThemePath) : val
    }
    
    return val === undefined ? defaultValue : val
  }
  
  // Process all top-level keys
  return Object.keys(object).reduce((resolved, key) => {
    return {
      ...resolved,
      [key]: isFunction(object[key]) 
        ? object[key](resolveThemePath, configUtils) 
        : object[key]
    }
  }, {})
}

/**
 * Resolve configuration by merging configs and resolving function values
 * @param {Array} configs - Array of configuration objects
 * @returns {Object} Resolved configuration
 */
export default function resolveConfig(configs) {
  // Extract and process all theme configs
  const mergedTheme = defaults({}, ...map(configs, 'theme'))
  
  // Resolve extensions and function values in the theme
  const resolvedTheme = resolveFunctionKeys(mergeExtensions(mergedTheme))
  
  // Merge resolved theme with other config properties
  return defaults(
    { theme: resolvedTheme },
    ...configs
  )
}