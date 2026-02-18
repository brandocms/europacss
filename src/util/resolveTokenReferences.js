import toPath from 'lodash/toPath'

const TOKEN_REF_RE = /\{([^}]+)\}/g
const FULL_REF_RE = /^\{([^}]+)\}$/

/**
 * Resolve a dot-path to a value in the theme object
 * @param {Object} theme - The theme object
 * @param {string} path - Dot-separated path (e.g. 'colors.red')
 * @returns {*} The value at that path, or undefined
 */
function getByPath(theme, path) {
  const segments = toPath(path)
  let current = theme

  for (const segment of segments) {
    if (current === undefined || current === null) {
      return undefined
    }
    current = current[segment]
  }

  return current
}

/**
 * Deep-walk the resolved theme object and substitute {path.to.value} references.
 *
 * - Full reference ('{colors.red}'): returns the resolved value preserving type
 * - Partial interpolation ('1px solid {colors.red}'): string-replaces each {ref}
 * - Circular detection: throws if a cycle is found
 * - Memoization: caches resolved paths to avoid redundant lookups
 * - Error on missing: throws for references to non-existent paths
 *
 * @param {Object} theme - The resolved theme object (after function resolution)
 * @returns {Object} Theme with all token references resolved
 */
export default function resolveTokenReferences(theme) {
  const resolved = new Map()
  const resolving = new Set()

  /**
   * Resolve a single value, which may contain token references
   * @param {*} val - The value to resolve
   * @param {string} currentPath - The dot path of the current value (for error messages)
   * @returns {*} The resolved value
   */
  function resolveValue(val, currentPath) {
    if (typeof val === 'string') {
      // Check if it's a full reference (entire string is one {ref})
      const fullMatch = val.match(FULL_REF_RE)
      if (fullMatch) {
        const refPath = fullMatch[1]
        return resolveRef(refPath, currentPath)
      }

      // Check for partial interpolation (one or more {ref} within a larger string)
      if (TOKEN_REF_RE.test(val)) {
        // Reset lastIndex since we used .test()
        TOKEN_REF_RE.lastIndex = 0
        return val.replace(TOKEN_REF_RE, (_, refPath) => {
          const refValue = resolveRef(refPath, currentPath)
          if (typeof refValue !== 'string' && typeof refValue !== 'number') {
            throw new Error(
              `Token reference error: Cannot interpolate {${refPath}} into string at "${currentPath}" — referenced value is a ${typeof refValue}, not a string or number`
            )
          }
          return refValue
        })
      }
    }

    if (Array.isArray(val)) {
      return val.map((item, i) => resolveValue(item, `${currentPath}[${i}]`))
    }

    if (val !== null && typeof val === 'object') {
      return resolveObject(val, currentPath)
    }

    // Non-string primitives pass through
    return val
  }

  /**
   * Resolve a reference path, with circular detection and memoization
   * @param {string} refPath - The dot path being referenced (e.g. 'colors.red')
   * @param {string} fromPath - The path that contains this reference (for error messages)
   * @returns {*} The resolved value
   */
  function resolveRef(refPath, fromPath) {
    if (resolved.has(refPath)) {
      return resolved.get(refPath)
    }

    if (resolving.has(refPath)) {
      throw new Error(
        `Token reference error: Circular reference detected — "${fromPath}" references "{${refPath}}" which is already being resolved`
      )
    }

    const rawValue = getByPath(theme, refPath)

    if (rawValue === undefined) {
      throw new Error(
        `Token reference error: "{${refPath}}" referenced from "${fromPath}" does not exist in the theme`
      )
    }

    resolving.add(refPath)
    const resolvedValue = resolveValue(rawValue, refPath)
    resolving.delete(refPath)

    resolved.set(refPath, resolvedValue)
    return resolvedValue
  }

  /**
   * Resolve all values in an object
   * @param {Object} obj - Object to resolve
   * @param {string} parentPath - Dot path of the parent
   * @returns {Object} Object with resolved values
   */
  function resolveObject(obj, parentPath) {
    const result = {}
    for (const key of Object.keys(obj)) {
      const path = parentPath ? `${parentPath}.${key}` : key
      result[key] = resolveValue(obj[key], path)
    }
    return result
  }

  return resolveObject(theme, '')
}
