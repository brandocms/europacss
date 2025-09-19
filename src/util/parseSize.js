import _ from 'lodash'
import renderCalcWithRounder from './renderCalcWithRounder'
import calcMinFromBreakpoint from './calcMinFromBreakpoint'
import calcMaxFromBreakpoint from './calcMaxFromBreakpoint'
import getUnit from './getUnit'
import splitUnit from './splitUnit'
import stripNestedCalcs from './stripNestedCalcs'
import isLargestBreakpoint from './isLargestBreakpoint'
import getLargestContainer from './getLargestContainer'
import replaceWildcards from './replaceWildcards'

// Constants for commonly used strings
const SPECIAL_VALUES = {
  ZERO: '0',
  AUTO: 'auto'
}

const CALC_EXPRESSION = 'calc'
const BETWEEN_EXPRESSION = 'between('
const VERTICAL_RHYTHM_EXPRESSION = 'vertical-rhythm('
const CONTAINER_FULL = 'container'
const CONTAINER_HALF = 'container/2'
const CONTAINER_NEGATIVE = '-container'
const CONTAINER_NEGATIVE_HALF = '-container/2'
const CSS_VAR_PREFIX = 'var(--'
const DPX_UNIT = 'dpx'

/**
 * Process a 'between' expression which creates a responsive value
 * that scales between a min and max value across a breakpoint
 *
 * @param {string} size The size string containing between() expression
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for error reporting
 * @returns {string} Calculated CSS calc() expression
 */
const processBetween = (size, config, bp, node) => {
  size = size.match(/between\((.*)\)/)[1]

  if (size.indexOf('-') > -1) {
    // alternative syntax - `minSize-maxSize`
    const [minSize, maxSize] = size.split('-')
    const sizeUnit = getUnit(minSize)
    const maxSizeUnit = getUnit(maxSize)

    let minWidth = calcMinFromBreakpoint(config.theme.breakpoints, bp)
    let maxWidth = calcMaxFromBreakpoint(config.theme.breakpoints, bp)

    if (!maxWidth) {
      // no max width for this breakpoint. Add 200 to min :)
      // TODO: maybe skip for the largest size? set a flag here and return reg size?
      maxWidth = `${parseFloat(minWidth) + 200}${getUnit(minWidth)}`
    }

    const widthUnit = getUnit(minWidth)
    const maxWidthUnit = getUnit(maxWidth)
    const rootSize = config.theme.typography.rootSize

    if (sizeUnit === null) {
      throw node.error(`BETWEEN: Sizes need unit values - breakpoint: ${bp} - size: ${size}`)
    }

    if (sizeUnit !== maxSizeUnit && widthUnit !== maxWidthUnit) {
      throw node.error('BETWEEN: min/max unit types must match')
    }

    if (sizeUnit === 'rem' && widthUnit === 'px') {
      minWidth = pxToRem(minWidth, rootSize)
      maxWidth = pxToRem(maxWidth, rootSize)
    }

    // Build the responsive type decleration
    const sizeDiff = parseFloat(maxSize) - parseFloat(minSize)
    const rangeDiff = parseFloat(maxWidth) - parseFloat(minWidth)

    if (sizeDiff === 0) {
      // not really responsive. just return the regular max
      return maxSize
    }

    if (minWidth === '0') {
      minWidth = '320px'
    }

    return `calc(${minSize} + ${sizeDiff} * ((100vw - ${minWidth}) / ${rangeDiff}))`
  } else {
    throw node.error('SPACING: `between()` needs a range - between(50px-95px)', { name: bp })
  }
}

/**
 * Process a vertical rhythm expression
 *
 * @param {string} size The size string
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for error reporting
 * @returns {string} Calculated expression
 */
function processVerticalRhythm(size, config, bp, node) {
  const params = size.match(/vertical-rhythm\((.*)\)/)[1]
  const [key, lineHeight = config.theme.typography.lineHeight[bp]] = params
    .split(',')
    .map(p => p.trim())
  const obj = _.get(config, key.split('.'))

  // does it exist?
  if (!obj) {
    throw node.error(`SPACING: No \`${key}\` size key theme object.`)
  }

  let fs

  if (_.isObject(obj[bp])) {
    fs = obj[bp]['font-size']
  } else {
    fs = parseSize(node, config, obj[bp], bp)

    if (fs.indexOf('calc(') > -1) {
      // toss out calc
      fs = fs.match(/calc\((.*)\)/)[1]
    }
  }

  return `calc(${fs} * ${lineHeight})`
}

/**
 * Process a container-related size value
 *
 * @param {string} size The size string (container, container/2, etc)
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for error reporting
 * @returns {string|null} Calculated size value or null if not a container-related size
 */
function processContainerSize(size, config, bp, node) {
  // First check if this is a container-related size
  if (
    size !== CONTAINER_FULL &&
    size !== CONTAINER_HALF &&
    size !== CONTAINER_NEGATIVE &&
    size !== CONTAINER_NEGATIVE_HALF
  ) {
    return null
  }

  // Now that we know it's a container size, check if the breakpoint exists
  if (!bp || !_.has(config.theme.container.padding, bp)) {
    throw node.error(`SPACING: No \`${bp}\` breakpoint found in \`theme.container.padding\`.`, {
      name: bp
    })
  }

  // Get the raw padding value
  const rawPaddingValue = config.theme.container.padding[bp]

  // Handle special '*' value for dynamic padding (with optional minimum)
  let paddingValue
  if (rawPaddingValue && typeof rawPaddingValue === 'string' && rawPaddingValue.startsWith('*')) {
    const maxWidth = config.theme.container.maxWidth[bp]
    const dynamicPadding = `calc((100vw - ${maxWidth}) / 2)`

    // Parse for minimum padding: '* 30px' or '* 30dpx'
    const parts = rawPaddingValue.split(' ').filter(p => p)

    if (parts.length > 1) {
      // Has minimum padding specified
      const minPadding = parts[1]

      // Process the minimum padding value (handles dpx if present)
      let processedMinPadding
      const [val, unit] = splitUnit(minPadding)

      if (unit === DPX_UNIT) {
        processedMinPadding = processDpxValue(minPadding, config, bp, node)
      } else {
        processedMinPadding = minPadding
      }

      // Use max() to ensure padding never goes below minimum
      paddingValue = `max(${processedMinPadding}, ${dynamicPadding})`
    } else {
      // No minimum, use pure dynamic padding
      paddingValue = dynamicPadding
    }
  } else {
    const [val, unit] = splitUnit(rawPaddingValue)

    // Check if the padding uses dpx units and process if needed
    if (unit === DPX_UNIT) {
      paddingValue = processDpxValue(rawPaddingValue, config, bp, node)
    } else {
      paddingValue = rawPaddingValue
    }
  }

  switch (size) {
    case CONTAINER_FULL:
      return paddingValue

    case CONTAINER_HALF: {
      // For max() expressions, we need to handle them specially
      if (paddingValue.startsWith('max(')) {
        return `calc(${paddingValue} / 2)`
      }
      // For calculated values like calc(...), we need to wrap in calc
      if (paddingValue.startsWith('calc(')) {
        // Extract the calculation inside calc() without adding extra parentheses
        const calcContent = paddingValue.substring(5, paddingValue.length - 1)
        return `calc((${calcContent}) / 2)`
      }
      // For simple values, we can just divide the value
      const [paddingVal, paddingUnit] = splitUnit(paddingValue)
      return `${paddingVal / 2}${paddingUnit}`
    }

    case CONTAINER_NEGATIVE:
      // For max() expressions, we need to handle them specially
      if (paddingValue.startsWith('max(')) {
        return `calc(-1 * ${paddingValue})`
      }
      // If it's a calc, we need to negate the entire expression
      if (paddingValue.startsWith('calc(')) {
        const calcContent = paddingValue.substring(5, paddingValue.length - 1)
        return `calc(-1 * (${calcContent}))`
      }
      return '-' + paddingValue

    case CONTAINER_NEGATIVE_HALF: {
      // For max() expressions, we need to handle them specially
      if (paddingValue.startsWith('max(')) {
        return `calc(-1 * (${paddingValue} / 2))`
      }
      // For calculated values like calc(...), we need to wrap in calc
      if (paddingValue.startsWith('calc(')) {
        const calcContent = paddingValue.substring(5, paddingValue.length - 1)
        return `calc(-1 * ((${calcContent}) / 2))`
      }
      // For simple values, we can just negate and divide the value
      const [paddingVal, paddingUnit] = splitUnit(paddingValue)
      return `-${paddingVal / 2}${paddingUnit}`
    }

    default:
      return null
  }
}

/**
 * Process a calc expression with var replacements
 *
 * @param {string} size The size string with calc expression
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for error reporting
 * @returns {string} Processed calc expression
 */
function processCalcExpression(size, config, bp, node) {
  if (!bp) {
    throw node.error('SPACING: Calc expressions need a breakpoint due to var calculations', {
      name: bp
    })
  }

  // it's a calc expression. interpolate values and return string
  const regex = /var\[(.*?)\]/g
  let match
  const matches = []

  while ((match = regex.exec(size)) != null) {
    matches.push(match[1])
  }

  matches.forEach(m => {
    const parsedMatch = parseSize(node, config, m, bp)
    // Only add parentheses if the value contains operators and isn't already wrapped
    const needsParens =
      !parsedMatch.startsWith('(') &&
      !parsedMatch.startsWith('calc(') &&
      (parsedMatch.includes('+') ||
        parsedMatch.includes('-') ||
        parsedMatch.includes('*') ||
        parsedMatch.includes('/'))

    size = size.replace(`var[${m}]`, needsParens ? `(${parsedMatch})` : parsedMatch)
  })

  // Pre-process any dpx units in the calc expression before passing to the reduceCSSCalc
  if (size.indexOf(DPX_UNIT) !== -1) {
    // First extract the content of the calc expression
    const calcContent = size.match(/calc\((.*)\)/)?.[1] || size

    // Create a pattern that finds all dpx values, even when inside nested expressions
    const dpxRegex = /(\d*\.?\d+)dpx/g
    let processedContent = calcContent
    let match

    // Process each dpx value found
    while ((match = dpxRegex.exec(calcContent)) !== null) {
      const value = match[1]
      const dpxValue = `${value}${DPX_UNIT}`

      // Process the dpx value but don't apply the calc wrapper yet
      // For tablet/desktop with zoom, this returns something like "calc(2.43056vw * var(--ec-zoom))"
      const dpxProcessed = processDpxValue(dpxValue, config, bp, node)

      // Extract the content from calc() if present to avoid nested calc()
      let processedForCalc
      if (dpxProcessed.startsWith('calc(') && dpxProcessed.endsWith(')')) {
        processedForCalc = dpxProcessed.substring(5, dpxProcessed.length - 1)
      } else {
        processedForCalc = dpxProcessed
      }

      // Replace the dpx value with its processed equivalent
      processedContent = processedContent.replace(`${value}dpx`, processedForCalc)
    }

    // Rebuild the calc expression with processed values
    return size.includes('calc(') ? `calc(${processedContent})` : `calc(${processedContent})`
  }

  return stripNestedCalcs(size)
}

/**
 * Process a fraction expression
 *
 * @param {string} size The size string with fraction
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for error reporting
 * @returns {string} Processed fraction value
 */
function processFractionExpression(size, config, bp, node) {
  // Check if first part is a spacing key
  const [head, tail] = size.split('/')

  if (_.has(config.theme.spacing, head)) {
    if (!_.has(config.theme.spacing[head], bp)) {
      throw node.error(`SPACING: No \`${bp}\` breakpoint found in spacing map for \`${head}\`.`)
    }
    return `calc(${config.theme.spacing[head][bp]}/${tail})`
  }

  // It's a complex column fraction
  if (!bp) {
    throw node.error('SPACING: Fractions need a breakpoint due to gutter calculations', {
      name: bp
    })
  }

  return processComplexFraction(size, config, bp, node)
}

/**
 * Process a complex fraction expression with gutters
 *
 * @param {string} size The size string
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for error reporting
 * @returns {string} Processed complex fraction
 */
function processComplexFraction(size, config, bp, node) {
  let gutterMultiplier
  let totalGutterMultiplier
  let sizeMath
  let [wantedColumns, totalColumns] = size.split('/')

  if (wantedColumns.indexOf(':') !== -1) {
    // we have a gutter indicator (@column 6:1/12) -- meaning we want X times the gutter to be added
    // first split the fraction
    ;[wantedColumns, gutterMultiplier] = wantedColumns.split(':')
  }

  if (totalColumns.indexOf(':') !== -1) {
    // we have a gutter indicator (@column 6/10:1) -- meaning we want X times the gutter to be added
    // first split the fraction
    ;[totalColumns, totalGutterMultiplier] = totalColumns.split(':')
  }

  const gutterSize = config.theme.columns.gutters[bp]

  // Pre-process dpx units in gutter size before using it in calculations
  let processedGutterSize = gutterSize
  if (typeof gutterSize === 'string' && gutterSize.indexOf(DPX_UNIT) !== -1) {
    processedGutterSize = processDpxValue(gutterSize, config, bp, node)
    // Remove calc() wrapper if present
    if (processedGutterSize.startsWith('calc(') && processedGutterSize.endsWith(')')) {
      processedGutterSize = processedGutterSize.substring(5, processedGutterSize.length - 1)
    }
  }

  let [gutterValue, gutterUnit] = splitUnit(processedGutterSize)

  if (config.setMaxForVw && gutterUnit == 'vw' && isLargestBreakpoint(config, bp)) {
    const maxSize = getLargestContainer(config)

    const [valMax, unitMax] = splitUnit(maxSize)
    if (unitMax === '%') {
      throw node.error(`SPACING: When setMaxForVw is true, the container max cannot be % based.`)
    }

    gutterValue = (valMax / 100) * gutterValue
    gutterUnit = unitMax
  }

  if (wantedColumns / totalColumns === 1 && gutterMultiplier === totalGutterMultiplier) {
    if (gutterMultiplier && !totalGutterMultiplier) {
      // if we have a gutter multiplier, but wanted and total columns are equal,
      // we are overflowing (@column 8:1/8)
      throw node.error(
        `SPACING: Overflowing columns. wantedColumns + gutterMultiplier is more than totalColumns (@column ${wantedColumns}:${gutterMultiplier}/${wantedColumns})`
      )
    }

    sizeMath = '100%'
    return sizeMath
  } else {
    if (totalGutterMultiplier) {
      sizeMath = `${wantedColumns}/${totalColumns} - (${gutterValue}${gutterUnit} - 1/${totalColumns} * ${
        gutterValue * wantedColumns
      }${gutterUnit}) - ${
        gutterValue * totalGutterMultiplier
      }${gutterUnit} + (${gutterValue}${gutterUnit} - 1/${totalColumns} * ${
        gutterValue * wantedColumns
      }${gutterUnit})`
    } else {
      sizeMath = `${wantedColumns}/${totalColumns} - (${gutterValue}${gutterUnit} - 1/${totalColumns} * ${
        gutterValue * wantedColumns
      }${gutterUnit})`
    }
  }

  if (gutterMultiplier) {
    sizeMath = `${sizeMath} + ${gutterValue * gutterMultiplier}${gutterUnit}`
    return renderCalcWithRounder(sizeMath)
  } else {
    if (sizeMath === '100%') {
      return sizeMath
    }

    return renderCalcWithRounder(sizeMath)
  }
}

/**
 * Process a multiplication expression
 *
 * @param {string} size The size string with multiplication
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for error reporting
 * @returns {string} Processed multiplication value
 */
function processMultiplicationExpression(size, config, bp, node) {
  const [head, tail] = size.split('*')

  // Handle a between() expression that needs to be multiplied
  if (head.indexOf(BETWEEN_EXPRESSION) !== -1) {
    // Process the between expression first
    const processedBetween = processBetween(head, config, bp, node)

    // If it returned a calc expression, multiply inside the calc
    if (processedBetween.startsWith('calc(')) {
      // Extract the calculation inside calc()
      const calcExpression = processedBetween.match(/calc\((.*)\)/)[1]
      return `calc((${calcExpression}) * ${tail})`
    }

    // For non-calc expressions, multiply directly
    return renderCalcWithRounder(`${processedBetween}*${tail}`)
  }

  // Check if it's a spacing key in the config
  if (!_.has(config.theme.spacing, head)) {
    return renderCalcWithRounder(size)
  }

  // Check if the breakpoint exists for this spacing key
  if (!_.has(config.theme.spacing[head], bp)) {
    throw node.error(`SPACING: No \`${bp}\` breakpoint found in spacing map for \`${head}\`.`)
  }

  return `calc(${config.theme.spacing[head][bp]}*${tail})`
}

/**
 * Process a viewport width (vw) value
 *
 * @param {string} size The size string with vw
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for error reporting
 * @param {boolean} applyZoom Whether to apply the zoom variable (default: false)
 * @returns {string} Processed vw value
 */
function processVwValue(size, config, bp, node, applyZoom = false) {
  // Check if we should use fixed size for the largest breakpoint (same logic as parseVWQuery)
  if (config.hasOwnProperty('setMaxForVw') && config.setMaxForVw === true && isLargestBreakpoint(config, bp)) {
    const maxSize = getLargestContainer(config)
    const [valMax, unitMax] = splitUnit(maxSize)
    if (unitMax === '%') {
      throw node.error(
        `SPACING: When setMaxForVw is true, the container max cannot be % based.`
      )
    }
    const [valVw, unitVw] = splitUnit(size)
    const maxVal = (valMax / 100) * valVw
    return `${maxVal}${unitMax}`
  }

  // Apply zoom variable to vw units if requested
  if (applyZoom) {
    // Return with calc() wrapper to handle the multiplication properly
    return `calc(${size} * var(--ec-zoom))`
  }

  return size
}

/**
 * Get reference viewport width for a breakpoint or breakpoint collection
 *
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for warning
 * @returns {number} Reference viewport width
 */
function getReferenceViewportWidth(config, bp, node) {
  // Check if we have dpxViewportSizes config
  if (config.dpxViewportSizes && typeof config.dpxViewportSizes === 'object') {
    // First check if we have a direct breakpoint match
    if (config.dpxViewportSizes[bp]) {
      return config.dpxViewportSizes[bp]
    }

    // Check if bp is part of a collection with a reference width
    if (config.theme && config.theme.breakpointCollections) {
      for (const [collection, breakpoints] of Object.entries(
        config.theme.breakpointCollections
      )) {
        if (breakpoints.split('/').includes(bp) && config.dpxViewportSizes[collection]) {
          return config.dpxViewportSizes[collection]
        }
      }
    }
  }

  // Fall back to global setting or default
  return config.dpxViewportSize || 1440
}

/**
 * Process design-pixel (dpx) units
 * Converts dpx values to vw units based on a reference viewport width
 *
 * @param {string} size The size string with dpx unit
 * @param {object} config Configuration object
 * @param {string} bp Current breakpoint
 * @param {object} node PostCSS node for error reporting
 * @returns {string} Processed vw value
 */
function processDpxValue(size, config, bp, node) {
  // Extract the numeric value from the size
  const [value, _unit] = splitUnit(size)

  // Get the reference viewport width for this breakpoint or collection
  const referenceViewportWidth = getReferenceViewportWidth(config, bp, node)

  // Calculate the equivalent vw value: (value / referenceWidth) * 100
  const vwValue = ((value / referenceViewportWidth) * 100).toFixed(5)

  // Process as vw value (handles setMaxForVw if needed)
  // Always apply zoom for dpx-derived values
  return processVwValue(`${vwValue}vw`, config, bp, node, true)
}

/**
 * Check if a value contains a CSS unit
 *
 * @param {string} size The size string to check
 * @returns {boolean} True if the size contains a CSS unit
 */
function hasCssUnit(size) {
  const units = [
    'px',
    'vh',
    'vw',
    'rem',
    'em',
    'ch',
    '%',
    'lh',
    'svw',
    'lvw',
    'dvw',
    'svh',
    'lvh',
    'dvh',
    'dpx'
  ]
  return units.some(unit => size.indexOf(unit) !== -1)
}

/**
 * Handle column gutter multiplier for numeric values
 *
 * @param {object} node PostCSS node for error reporting
 * @param {string|number} multiplier The multiplier value
 * @param {string} bp Current breakpoint
 * @param {object} config Configuration object
 * @returns {string} Calculated gutter value
 */
function renderColGutterMultiplier(node, multiplier, bp, config) {
  // grab gutter for this breakpoint
  if (!_.has(config.theme.columns.gutters, bp)) {
    throw node.error(`parseSize: No \`${bp}\` breakpoint found in gutter map.`, { name: bp })
  }

  const gutter = config.theme.columns.gutters[bp]
  const [val, unit] = splitUnit(gutter)

  // Check if the gutter uses dpx units
  if (unit === DPX_UNIT) {
    // Create a dpx value with the multiplier applied
    const dpxValue = `${val * multiplier}${DPX_UNIT}`

    // If this is the largest breakpoint and setMaxForVw is true,
    // we need to handle this specially to ensure the max pixel value is used
    if (
      config.hasOwnProperty('setMaxForVw') &&
      config.setMaxForVw === true &&
      isLargestBreakpoint(config, bp)
    ) {
      // Get the reference viewport width
      const referenceViewportWidth = getReferenceViewportWidth(config, bp, node)

      // Get the container max width
      const containerBps = config.theme.container.maxWidth
      const lastKey = [...Object.keys(containerBps)].pop()
      const maxSize = containerBps[lastKey]
      const [valMax, unitMax] = splitUnit(maxSize)

      // Calculate the pixel value: (dpx_value / referenceWidth) * maxContainerWidth
      const pxValue = ((val * multiplier) / referenceViewportWidth) * valMax
      return `${pxValue}${unitMax}`
    }

    // Otherwise, process the dpx value normally
    return processDpxValue(dpxValue, config, bp, node)
  }

  // Handle vw units with max conversion
  if (
    unit === 'vw' &&
    config.hasOwnProperty('setMaxForVw') &&
    config.setMaxForVw === true &&
    isLargestBreakpoint(config, bp)
  ) {
    const maxSize = getLargestContainer(config)
    const [valMax, unitMax] = splitUnit(maxSize)
    const gutterInPixels = (valMax / 100) * val
    return `${gutterInPixels * multiplier}${unitMax}`
  }

  return `${val * multiplier}${unit}`
}

/**
 * Convert px value to rem
 *
 * @param {string} px Value with px unit
 * @param {string} rootSize Root font size
 * @returns {string} Value converted to rem
 */
function pxToRem(px, rootSize) {
  return parseFloat(px) / parseFloat(rootSize) + 'rem'
}

/**
 * Parse size values from a variety of formats into consistent CSS values
 *
 * @param {object} node PostCSS node for error reporting
 * @param {object} config Configuration object
 * @param {string} size Size value to parse
 * @param {string} bp Current breakpoint
 * @returns {string} Parsed and processed CSS value
 */
export default function parseSize(node, config, size, bp) {
  // Handle special and simple cases first
  if (size === SPECIAL_VALUES.ZERO) {
    return SPECIAL_VALUES.ZERO
  }

  if (size === SPECIAL_VALUES.AUTO) {
    return SPECIAL_VALUES.AUTO
  }

  if (size && size.startsWith(CSS_VAR_PREFIX)) {
    return size
  }

  // Handle multiplication for spacing keys (e.g., between*2)
  let multiplier = 1
  if (size && size.indexOf('*') !== -1) {
    const [spacingKey, mult] = size.split('*')
    if (_.has(config.theme.spacing, spacingKey)) {
      multiplier = parseFloat(mult)
      size = spacingKey
    }
  }
  
  // Handle negative named spacing sizes
  if (size && size.startsWith('-') && _.has(config.theme.spacing, size.substring(1))) {
    multiplier = -1
    size = size.substring(1)
  }

  // Check if size is a named spacing value in config
  let sizeMap
  if (_.has(config.theme.spacing, size)) {
    sizeMap = replaceWildcards(config.theme.spacing[size], config)
    size = sizeMap[bp]

    // Apply multiplier if needed
    if (multiplier !== 1) {
      // If it's a between expression, we'll handle it specially
      if (size && size.indexOf(BETWEEN_EXPRESSION) !== -1) {
        const processedBetween = processBetween(size, config, bp, node)
        if (processedBetween.startsWith('calc(')) {
          const calcExpression = processedBetween.match(/calc\((.*)\)/)[1]
          return `calc((${calcExpression}) * ${multiplier})`
        }
        return renderCalcWithRounder(`${processedBetween}*${multiplier}`)
      } else if (size) {
        return `calc(${size} * ${multiplier})`
      }
    }
  }

  // Process different expressions based on their pattern
  if (size) {
    // Vertical rhythm expression
    if (size.indexOf(VERTICAL_RHYTHM_EXPRESSION) !== -1) {
      return processVerticalRhythm(size, config, bp, node)
    }

    // Between expression for responsive values
    if (size.indexOf(BETWEEN_EXPRESSION) !== -1) {
      return processBetween(size, config, bp, node)
    }

    // Container-related values
    const containerValue = processContainerSize(size, config, bp, node)
    if (containerValue !== null) {
      return containerValue
    }

    // If size isn't in the spacing map, treat it as a direct value
    if (!_.has(config.theme.spacing, size)) {
      // Calc expression with var replacements
      if (size.indexOf(CALC_EXPRESSION) !== -1) {
        return processCalcExpression(size, config, bp, node)
      }

      // Fraction expression (e.g., "3/12")
      if (size.indexOf('/') !== -1) {
        return processFractionExpression(size, config, bp, node)
      }

      // Multiplication expression (e.g., "spacing*2")
      if (size.indexOf('*') !== -1) {
        return processMultiplicationExpression(size, config, bp, node)
      }

      // Viewport width units with max size conversion
      if (size.indexOf('vw') !== -1) {
        return processVwValue(size, config, bp, node)
      }

      // Design pixel units (dpx)
      if (size.indexOf(DPX_UNIT) !== -1) {
        return processDpxValue(size, config, bp, node)
      }

      // Direct CSS values with units
      if (hasCssUnit(size)) {
        return size
      }

      // Treat numeric values as column gutter multipliers
      return renderColGutterMultiplier(node, size, bp, config)
    }
  }

  // If we reached here and have a spacing key but no matching breakpoint, throw an error
  if (_.has(config.theme.spacing, size) && !_.has(config.theme.spacing[size], bp)) {
    throw node.error(`SPACING: No \`${bp}\` breakpoint found in spacing map for \`${size}\`.`)
  }

  // Should not reach here, but return original size just in case
  return size
}
