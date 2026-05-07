import _ from 'lodash'

/**
 * Resolve a config key that may use dot or slash notation for hierarchy access.
 * Tries dot notation first, then slash notation as fallback.
 *
 * @param {object} config - The full config object
 * @param {string[]} basePath - Base path array (e.g. ['theme', 'colors'])
 * @param {string} key - The key to resolve (e.g. 'red.100' or 'red/100')
 * @returns {*} The resolved value, or undefined if not found
 */
export default function resolveConfigKey(config, basePath, key) {
  // Try dot notation
  const dotResult = _.get(config, basePath.concat(key.split('.')))
  if (dotResult !== undefined) {
    return dotResult
  }

  // Try slash notation if it contains slashes
  if (key.includes('/')) {
    const slashResult = _.get(config, basePath.concat(key.split('/')))
    if (slashResult !== undefined) {
      return slashResult
    }
  }

  return undefined
}
