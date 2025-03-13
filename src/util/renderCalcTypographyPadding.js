import reduceCSSCalc from 'reduce-css-calc'
import _ from 'lodash'

/**
 * Render padding calculation for typography based on a divider value
 * Supports both single divider value and breakpoint-specific dividers
 * 
 * @param {String|Number} val Value to be divided
 * @param {Object} config Configuration object containing typography settings
 * @param {String} [breakpoint] Current breakpoint (optional)
 * @returns {String} Calculated CSS value
 */
export default function renderCalcTypographyPadding(val, { typography }, breakpoint) {
  let divider

  // Check if paddingDivider is an object with breakpoint-specific values
  if (_.isPlainObject(typography.paddingDivider)) {
    // If breakpoint is provided and exists in the divider map, use that value
    if (breakpoint && typography.paddingDivider[breakpoint]) {
      divider = typography.paddingDivider[breakpoint]
    } 
    // Otherwise fall back to a default value
    else {
      // First try to use a 'default' key if it exists
      if (typography.paddingDivider.default) {
        divider = typography.paddingDivider.default
      } 
      // Otherwise use the first available value
      else {
        const firstKey = Object.keys(typography.paddingDivider)[0]
        divider = typography.paddingDivider[firstKey] || 24 // Fallback to 24 if no values available
      }
    }
  } 
  // If paddingDivider is a simple value, use it directly
  else {
    divider = typography.paddingDivider || 24 // Fallback to 24 if not defined
  }
  
  return reduceCSSCalc(`calc(100% * ${val} / ${divider})`, 10)
}