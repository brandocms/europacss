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

export default function parseSize(node, config, size, bp) {
  let sizeMap

  if (size === '0') {
    return '0'
  }

  if (size === 'auto') {
    return 'auto'
  }

  if (size.startsWith('var(--')) {
    return size
  }

  // first check if we have it in our config spacing map
  // if we do, we extract it and run it through the normal checks
  if (_.has(config.theme.spacing, size)) {
    sizeMap = replaceWildcards(config.theme.spacing[size], config)
    size = sizeMap[bp]
  }

  if (size && size.indexOf('vertical-rhythm(') !== -1) {
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

  if (size && size.indexOf('between(') > -1) {
    return processBetween(size, config, bp, node)
  }

  if (size && size === '-container/2') {
    // get size from container.padding
    if (!_.has(config.theme.container.padding, bp)) {
      throw node.error(`SPACING: No \`${bp}\` breakpoint found in \`theme.container.padding\`.`, {
        name: bp
      })
    }

    const [val, unit] = splitUnit(config.theme.container.padding[bp])
    return `-${val / 2}${unit}`
  }

  if (size && size === '-container') {
    // get size from container.padding
    if (!_.has(config.theme.container.padding, bp)) {
      throw node.error(`SPACING: No \`${bp}\` breakpoint found in \`theme.container.padding\`.`, {
        name: bp
      })
    }

    return '-' + config.theme.container.padding[bp]
  }

  if (size && size === 'container/2') {
    // get size from container.padding
    if (!_.has(config.theme.container.padding, bp)) {
      throw node.error(`SPACING: No \`${bp}\` breakpoint found in \`theme.container.padding\`.`, {
        name: bp
      })
    }

    const [val, unit] = splitUnit(config.theme.container.padding[bp])
    return `${val / 2}${unit}`
  }

  if (size && size === 'container') {
    // get size from container.padding
    if (!_.has(config.theme.container.padding, bp)) {
      throw node.error(`SPACING: No \`${bp}\` breakpoint found in \`theme.container.padding\`.`, {
        name: bp
      })
    }
    return config.theme.container.padding[bp]
  }

  if (size && !_.has(config.theme.spacing, size)) {
    // size is not found in spacingMap, treat it as a value
    if (size.indexOf('calc') > -1) {
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
        size = size.replace(`var[${m}]`, parsedMatch)
      })

      return stripNestedCalcs(size)
    }

    if (size && size.indexOf('/') !== -1) {
      // it's a fraction, check if the first part is a spacing key
      const [head, tail] = size.split('/')
      if (!_.has(config.theme.spacing, head)) {
        if (!bp) {
          throw node.error('SPACING: Fractions need a breakpoint due to gutter calculations', {
            name: bp
          })
        }

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
        let [gutterValue, gutterUnit] = splitUnit(gutterSize)

        if (config.setMaxForVw && gutterUnit == 'vw' && isLargestBreakpoint(config, bp)) {
          const maxSize = getLargestContainer(config)

          const [valMax, unitMax] = splitUnit(maxSize)
          if (unitMax === '%') {
            throw node.error(
              `SPACING: When setMaxForVw is true, the container max cannot be % based.`
            )
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

      if (!_.has(config.theme.spacing[head], bp)) {
        throw node.error(`SPACING: No \`${bp}\` breakpoint found in spacing map for \`${head}\`.`)
      }

      return `calc(${config.theme.spacing[head][bp]}/${tail})`
    }

    if (size && size.indexOf('*') !== -1) {
      // it's *, check if the first part is a spacing key
      const [head, tail] = size.split('*')

      if (!_.has(config.theme.spacing, head)) {
        return renderCalcWithRounder(size)
      }

      if (!_.has(config.theme.spacing[head], bp)) {
        throw node.error(`SPACING: No \`${bp}\` breakpoint found in spacing map for \`${head}\`.`)
      }

      return `calc(${config.theme.spacing[head][bp]}*${tail})`
    }

    if (size && size.indexOf('vw') !== -1) {
      if (config.hasOwnProperty('setMaxForVw') && config.setMaxForVw === true) {
        // get the max container size
        const containerBps = config.theme.container.maxWidth
        const lastKey = [...Object.keys(containerBps)].pop()
        if (bp === lastKey) {
          const maxSize = containerBps[lastKey]
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
        return size
      } else {
        return size
      }
    }

    if (size) {
      if (
        size.indexOf('px') !== -1 ||
        size.indexOf('vh') !== -1 ||
        size.indexOf('rem') !== -1 ||
        size.indexOf('em') !== -1 ||
        size.indexOf('ch') !== -1 ||
        size.indexOf('%') !== -1
      ) {
        return size
      }
    }

    // it's a number. we treat regular numbers as a multiplier of col gutter.
    return renderColGutterMultiplier(node, size, bp, config)
  }

  if (!_.has(config.theme.spacing[size], bp)) {
    throw node.error(`SPACING: No \`${bp}\` breakpoint found in spacing map for \`${size}\`.`)
  }
}

function renderColGutterMultiplier(node, multiplier, bp, config) {
  // grab gutter for this breakpoint
  if (!_.has(config.theme.columns.gutters, bp)) {
    throw node.error(`parseSize: No \`${bp}\` breakpoint found in gutter map.`, { name: bp })
  }

  const gutter = config.theme.columns.gutters[bp]
  const [val, unit] = splitUnit(gutter)

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

function pxToRem(px, rootSize) {
  return parseFloat(px) / parseFloat(rootSize) + 'rem'
}
