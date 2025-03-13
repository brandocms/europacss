import splitUnit from './splitUnit'
import isLargestBreakpoint from './isLargestBreakpoint'
import getLargestContainer from './getLargestContainer'

/**
 * Parse a viewport width query for responsive typography
 * @param {Object} node - PostCSS node
 * @param {Object} config - Configuration object
 * @param {String} fontSizeQuery - Font size with viewport width units
 * @param {String} lineHeight - Line height value (optional)
 * @param {String} breakpoint - Current breakpoint name
 * @param {Boolean} onlyFontsize - Whether to return only font-size or both font-size and line-height
 * @returns {Object|String} Font size declaration or object with font-size and line-height
 */
export default function parseVWQuery(
  node,
  config,
  fontSizeQuery,
  lineHeight,
  breakpoint,
  onlyFontsize
) {
  // Handle the largest breakpoint specially when setMaxForVw is true
  if (shouldUseFixedSizeForVw(config, breakpoint)) {
    return processLargestBreakpoint(node, config, fontSizeQuery, lineHeight, onlyFontsize)
  }
  
  // Process regular viewport width values
  return processRegularVwValues(fontSizeQuery, lineHeight, onlyFontsize)
}

/**
 * Determine if we should use fixed sizes instead of viewport units
 * @param {Object} config - Configuration object
 * @param {String} breakpoint - Current breakpoint
 * @returns {Boolean} Whether to use fixed sizes
 */
function shouldUseFixedSizeForVw(config, breakpoint) {
  return config.hasOwnProperty('setMaxForVw') && 
         config.setMaxForVw === true && 
         isLargestBreakpoint(config, breakpoint)
}

/**
 * Process the largest breakpoint with fixed sizes instead of viewport units
 * @param {Object} node - PostCSS node
 * @param {Object} config - Configuration object
 * @param {String} fontSizeQuery - Font size with viewport width units
 * @param {String} lineHeight - Line height value (optional)
 * @param {Boolean} onlyFontsize - Whether to return only font-size
 * @returns {Object|String} Font size or font size and line height
 */
function processLargestBreakpoint(node, config, fontSizeQuery, lineHeight, onlyFontsize) {
  const maxSize = getLargestContainer(config)
  const [valMax, unitMax] = splitUnit(maxSize)
  
  // Check for invalid container max unit
  if (unitMax === '%') {
    throw node.error(
      `SPACING: When setMaxForVw is true, the container max cannot be % based.`
    )
  }
  
  const [valVw] = splitUnit(fontSizeQuery)
  const renderedFontSize = `${(valMax / 100) * valVw}${unitMax}`
  
  // Process line height if provided and it's also using viewport width
  let renderedLineHeight
  if (!onlyFontsize && lineHeight && lineHeight.endsWith('vw')) {
    const [lineHeightVw] = splitUnit(lineHeight)
    renderedLineHeight = `${(valMax / 100) * lineHeightVw}${unitMax}`
  }
  
  // Return just font size or both font size and line height
  return formatReturnValue(renderedFontSize, renderedLineHeight, onlyFontsize)
}

/**
 * Process regular viewport width values with zoom variable
 * @param {String} fontSizeQuery - Font size with viewport width units
 * @param {String} lineHeight - Line height value (optional)
 * @param {Boolean} onlyFontsize - Whether to return only font-size
 * @returns {Object|String} Font size or font size and line height
 */
function processRegularVwValues(fontSizeQuery, lineHeight, onlyFontsize) {
  const renderedFontSize = `calc(${fontSizeQuery} * var(--ec-zoom))`
  
  // Process line height if provided and it's using viewport width
  let renderedLineHeight
  if (!onlyFontsize && lineHeight && lineHeight.endsWith('vw')) {
    renderedLineHeight = `calc(${lineHeight} * var(--ec-zoom))`
  }
  
  // Return just font size or both font size and line height
  return formatReturnValue(renderedFontSize, renderedLineHeight, onlyFontsize)
}

/**
 * Format the return value based on the onlyFontsize flag
 * @param {String} fontSize - Processed font size
 * @param {String} lineHeight - Processed line height (optional)
 * @param {Boolean} onlyFontsize - Whether to return only font-size
 * @returns {Object|String} Font size or object with font-size and line-height
 */
function formatReturnValue(fontSize, lineHeight, onlyFontsize) {
  if (onlyFontsize) {
    return fontSize
  }

  return {
    'font-size': fontSize,
    ...(lineHeight && { 'line-height': lineHeight })
  }
}