import _ from 'lodash'
import splitUnit from './splitUnit'
import parseRFSQuery from './parseRFSQuery'
import parseVWQuery from './parseVWQuery'
import replaceWildcards from './replaceWildcards'
import calcMaxFromBreakpoint from './calcMaxFromBreakpoint'

// Constants
const BETWEEN_EXPRESSION = 'between(';
const SLASH_SEPARATOR = '/';
const VW_UNIT = 'vw';
const DPX_UNIT = 'dpx';

/**
 * Extract line height from font size query if present
 * 
 * @param {string} fontSizeQuery The font size query string
 * @returns {Array} Array containing [fontSizeQuery, lineHeight]
 */
function extractLineHeight(fontSizeQuery) {
  let lineHeight;
  
  if (fontSizeQuery.indexOf(SLASH_SEPARATOR) !== -1) {
    // we have a line-height parameter
    [fontSizeQuery, lineHeight] = fontSizeQuery.split(SLASH_SEPARATOR);
  }
  
  return [fontSizeQuery, lineHeight];
}

/**
 * Extract font size modifier from query if present (e.g., xs(1.6))
 * 
 * @param {string} fontSizeQuery The font size query string
 * @returns {Array} Array containing [fontSizeQuery, modifier]
 */
function extractModifier(fontSizeQuery) {
  let modifier;
  
  if (fontSizeQuery.indexOf(BETWEEN_EXPRESSION) === -1 && fontSizeQuery.indexOf('(') !== -1) {
    // we have a modifier xs(1.6) --> multiplies the size with 1.6
    modifier = fontSizeQuery.match(/\((.*)\)/)[1];
    fontSizeQuery = fontSizeQuery.split('(')[0];
  }
  
  return [fontSizeQuery, modifier];
}

/**
 * Process design-pixel (dpx) units
 * Converts dpx values to vw units based on a reference viewport width (defaulting to 1440px)
 * 
 * @param {string} fontSize The font size value with dpx unit
 * @param {string|null} lineHeight Optional line height value
 * @param {string} breakpoint Current breakpoint
 * @param {object} config Configuration object
 * @param {object} node PostCSS node for error reporting
 * @returns {object} Processed font size and line height properties
 */
function processDpxUnits(fontSize, lineHeight, breakpoint, config, node) {
  // Extract the numeric value from the font size
  const [fs, _fsUnit] = splitUnit(fontSize);
  
  // Get the reference viewport width (default to 1440px if not specified)
  const referenceViewportWidth = config.dpxViewportSize || 1440;
  
  // Calculate the equivalent vw value: (fontSize / referenceWidth) * 100
  const fsVw = ((fs / referenceViewportWidth) * 100).toFixed(5);
  
  // Handle validation for mixing units
  if (lineHeight && lineHeight.endsWith(VW_UNIT)) {
    throw node.error(
      `FONTSIZE: Mixing dpx and vw is not allowed with fontsize and lineheight`,
      { name: breakpoint }
    );
  }
  
  // Handle line height if it also uses dpx units
  if (lineHeight && lineHeight.endsWith(DPX_UNIT)) {
    const [lh, _lhUnit] = splitUnit(lineHeight);
    const lhVw = ((lh / referenceViewportWidth) * 100).toFixed(5);
    
    return parseVWQuery(node, config, `${fsVw}vw`, `${lhVw}vw`, breakpoint, false);
  }
  
  // Return font size as vw with original line height if provided
  return {
    'font-size': parseVWQuery(node, config, `${fsVw}vw`, lineHeight, breakpoint, true),
    ...(lineHeight && { 'line-height': lineHeight })
  };
}

/**
 * Process viewport width (vw) units
 * 
 * @param {string} fontSize The font size value with vw unit
 * @param {string|null} lineHeight Optional line height value
 * @param {string} breakpoint Current breakpoint
 * @param {object} config Configuration object
 * @param {object} node PostCSS node for error reporting
 * @returns {object} Processed font size and line height properties
 */
function processVwUnits(fontSize, lineHeight, breakpoint, config, node) {
  if (lineHeight && lineHeight.endsWith(VW_UNIT)) {
    return parseVWQuery(node, config, fontSize, lineHeight, breakpoint, false);
  } else {
    return {
      'font-size': parseVWQuery(node, config, fontSize, lineHeight, breakpoint, true),
      ...(lineHeight && { 'line-height': lineHeight })
    };
  }
}

/**
 * Process regular CSS units (px, rem, em, etc.)
 * 
 * @param {string} fontSize The font size value 
 * @param {string|null} lineHeight Optional line height value
 * @returns {object} Font size and line height properties
 */
function processRegularUnits(fontSize, lineHeight) {
  return {
    'font-size': fontSize,
    ...(lineHeight && { 'line-height': lineHeight })
  };
}

/**
 * Apply modifier to font size
 * 
 * @param {string|object} resolvedFontsize The font size value or object
 * @param {string} modifier The modifier value
 * @param {string} breakpoint Current breakpoint
 * @param {string|null} lineHeight Optional line height
 * @returns {object} Font size and line height properties
 */
function applyModifier(resolvedFontsize, modifier, breakpoint, lineHeight) {
  let fs;
  
  if (_.isString(resolvedFontsize)) {
    fs = resolvedFontsize;
  } else if (_.isObject(resolvedFontsize[breakpoint])) {
    fs = resolvedFontsize[breakpoint]['font-size'];
  } else {
    fs = resolvedFontsize[breakpoint];
  }
  
  const [val, unit] = splitUnit(fs);
  const renderedFontSize = `${val * modifier}${unit}`;
  
  return {
    'font-size': renderedFontSize,
    ...(lineHeight && { 'line-height': lineHeight })
  };
}

/**
 * Process object-based font size definition
 * 
 * @param {object} fontSizeObj The font size object for the breakpoint
 * @param {string|null} lineHeight Optional line height
 * @param {string} breakpoint Current breakpoint
 * @param {object} config Configuration object
 * @param {object} node PostCSS node for error reporting
 * @returns {object} Processed font properties
 */
function processObjectFontSize(fontSizeObj, lineHeight, breakpoint, config, node) {
  const props = {};
  
  _.keys(fontSizeObj).forEach(key => {
    const value = fontSizeObj[key];
    
    if (value.endsWith(VW_UNIT)) {
      props[key] = parseVWQuery(node, config, value, lineHeight, breakpoint, true);
    } else if (value.endsWith(DPX_UNIT)) {
      const [fs, _fsUnit] = splitUnit(value);
      const referenceViewportWidth = config.dpxViewportSize || 1440;
      const fsVw = ((fs / referenceViewportWidth) * 100).toFixed(5);
      props[key] = parseVWQuery(node, config, `${fsVw}vw`, lineHeight, breakpoint, true);
    } else {
      props[key] = value;
    }
  });
  
  return props;
}

/**
 * Parse a font size query and convert it to CSS properties
 * 
 * @param {object} node PostCSS node for error reporting
 * @param {object} config Configuration object
 * @param {string} fontSizeQuery The font size query to parse
 * @param {string} breakpoint Current breakpoint
 * @returns {object} Font properties object
 */
export default function parseFontSizeQuery(node, config, fontSizeQuery, breakpoint) {
  // Extract line height and modifier if present
  let lineHeight;
  let modifier;
  
  [fontSizeQuery, lineHeight] = extractLineHeight(fontSizeQuery);
  [fontSizeQuery, modifier] = extractModifier(fontSizeQuery);
  
  // Resolve font size from theme configuration
  const themePath = ['theme', 'typography', 'sizes'];
  const fontSize = fontSizeQuery;
  const path = fontSize.split('.');
  
  let resolvedFontsize = _.get(config, themePath.concat(path));
  if (!resolvedFontsize) {
    resolvedFontsize = fontSize;
  }
  
  // Early return for responsive font size with between() expression
  if (_.isString(resolvedFontsize) && resolvedFontsize.indexOf(BETWEEN_EXPRESSION) !== -1) {
    return parseRFSQuery(node, config, resolvedFontsize, lineHeight, breakpoint);
  }
  
  // Handle non-object font size definitions
  if (!_.isString(resolvedFontsize)) {
    resolvedFontsize = replaceWildcards(resolvedFontsize, config);
    
    if (!_.has(resolvedFontsize, breakpoint)) {
      throw node.error(
        `FONTSIZE: No breakpoint \`${breakpoint}\` found in theme.typography.sizes.${fontSize}`,
        { name: breakpoint }
      );
    }
  }
  
  // Apply modifier if present
  if (modifier) {
    return applyModifier(resolvedFontsize, modifier, breakpoint, lineHeight);
  }
  
  // Process string-based font sizes
  if (_.isString(resolvedFontsize)) {
    // Check for line height in the font size definition
    if (!lineHeight && resolvedFontsize.indexOf(SLASH_SEPARATOR) !== -1) {
      [resolvedFontsize, lineHeight] = resolvedFontsize.split(SLASH_SEPARATOR);
    }
    
    // Handle different unit types
    if (resolvedFontsize.endsWith(VW_UNIT)) {
      return processVwUnits(resolvedFontsize, lineHeight, breakpoint, config, node);
    } else if (resolvedFontsize.endsWith(DPX_UNIT)) {
      return processDpxUnits(resolvedFontsize, lineHeight, breakpoint, config, node);
    } else {
      return processRegularUnits(resolvedFontsize, lineHeight);
    }
  }
  
  // Process object-based font sizes
  let bpFontSize = resolvedFontsize[breakpoint];
  
  if (_.isObject(bpFontSize)) {
    return processObjectFontSize(bpFontSize, lineHeight, breakpoint, config, node);
  } else {
    // Handle string-based breakpoint font size
    let localLineHeight = lineHeight;
    
    if (!localLineHeight && bpFontSize.indexOf(SLASH_SEPARATOR) !== -1) {
      const parts = bpFontSize.split(SLASH_SEPARATOR);
      bpFontSize = parts[0];
      localLineHeight = parts[1];
    }
    
    // Handle between expression
    if (bpFontSize.indexOf(BETWEEN_EXPRESSION) !== -1) {
      return parseRFSQuery(node, config, bpFontSize, localLineHeight, breakpoint);
    }
    
    // Handle different unit types
    if (bpFontSize.endsWith(VW_UNIT)) {
      return processVwUnits(bpFontSize, localLineHeight, breakpoint, config, node);
    } else if (bpFontSize.endsWith(DPX_UNIT)) {
      return processDpxUnits(bpFontSize, localLineHeight, breakpoint, config, node);
    } else {
      return processRegularUnits(bpFontSize, localLineHeight);
    }
  }
}