import calcMinFromBreakpoint from './calcMinFromBreakpoint'
import calcMaxFromBreakpoint from './calcMaxFromBreakpoint'
import getUnit from './getUnit'

/**
 * Parse Responsive Font Size (RFS) settings and generate a responsive font size calculation
 * @param {Object} node - PostCSS node
 * @param {Object} config - Configuration object
 * @param {String} size - Size range in format "minSize-maxSize"
 * @param {String} breakpoint - Current breakpoint
 * @returns {String} Calculated responsive font size expression
 */
export default function parseRFS(node, config, size, breakpoint) {
  const [minSize, maxSize] = size.split('-')
  
  // Validate and process size values
  validateSizeValues(node, minSize, maxSize, breakpoint)
  
  // Calculate breakpoint widths
  const { minWidth, maxWidth } = calculateBreakpointWidths(config, breakpoint, minSize)
  
  // Calculate size difference
  const sizeDiff = calculateSizeDifference(minSize, maxSize)
  
  // Handle non-responsive case
  if (sizeDiff === 0) {
    return maxSize
  }
  
  // Calculate range difference
  const rangeDiff = parseFloat(maxWidth) - parseFloat(minWidth)
  
  // Build and return the responsive formula
  return `calc(${minSize} + ${sizeDiff} * ((100vw - ${minWidth}) / ${rangeDiff}))`
}

/**
 * Validate size values and ensure units are consistent
 * @param {Object} node - PostCSS node
 * @param {String} minSize - Minimum size value
 * @param {String} maxSize - Maximum size value
 * @param {String} breakpoint - Current breakpoint
 * @throws {Error} If size values don't have units or units don't match
 */
function validateSizeValues(node, minSize, maxSize, breakpoint) {
  const sizeUnit = getUnit(minSize)
  const maxSizeUnit = getUnit(maxSize)
  
  if (sizeUnit === null) {
    throw node.error(`RFS: Sizes need unit values - breakpoint: ${breakpoint} - size: ${minSize}-${maxSize}`)
  }
  
  if (sizeUnit !== maxSizeUnit) {
    throw node.error('RFS: min/max unit types must match')
  }
}

/**
 * Calculate breakpoint min and max widths
 * @param {Object} config - Configuration object
 * @param {String} breakpoint - Current breakpoint
 * @param {String} minSize - The minimum size value with units
 * @returns {Object} Object with minWidth and maxWidth
 */
function calculateBreakpointWidths(config, breakpoint, minSize) {
  let minWidth = calcMinFromBreakpoint(config.theme.breakpoints, breakpoint)
  let maxWidth = calcMaxFromBreakpoint(config.theme.breakpoints, breakpoint)
  
  // Handle missing max width
  if (!maxWidth) {
    // No max width for this breakpoint. Add 200 to min
    // TODO: consider better handling for largest breakpoint
    maxWidth = `${parseFloat(minWidth) + 200}${getUnit(minWidth)}`
  }
  
  // Ensure unit consistency
  const widthUnit = getUnit(minWidth)
  const maxWidthUnit = getUnit(maxWidth)
  const rootSize = config.theme.typography.rootSize || '18px'
  
  if (widthUnit !== maxWidthUnit) {
    throw new Error('RFS: min/max unit types must match')
  }
  
  // Convert to rem if needed
  const minSizeUnit = getUnit(minSize)
  if (minSizeUnit === 'rem' && widthUnit === 'px') {
    minWidth = pxToRem(minWidth, rootSize)
    maxWidth = pxToRem(maxWidth, rootSize)
  }
  
  // Use sensible default for minWidth if it's zero
  if (minWidth === '0') {
    minWidth = '320px'
  }
  
  return { minWidth, maxWidth }
}

/**
 * Calculate the difference between max and min sizes
 * @param {String} minSize - Minimum size value
 * @param {String} maxSize - Maximum size value
 * @returns {Number} Size difference
 */
function calculateSizeDifference(minSize, maxSize) {
  return parseFloat(maxSize) - parseFloat(minSize)
}

/**
 * Convert a pixel value to rem
 * @param {String} px - Pixel value
 * @param {String} rootSize - Root font size
 * @returns {String} Rem value
 */
function pxToRem(px, rootSize) {
  return parseFloat(px) / parseFloat(rootSize) + 'rem'
}