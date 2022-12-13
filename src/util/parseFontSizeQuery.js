import _ from 'lodash'
import splitUnit from './splitUnit'
import parseRFSQuery from './parseRFSQuery'
import parseVWQuery from './parseVWQuery'
import replaceWildcards from './replaceWildcards'
import calcMaxFromBreakpoint from './calcMaxFromBreakpoint'

export default function parseFontSizeQuery(node, config, fontSizeQuery, breakpoint) {
  let lineHeight
  let modifier
  let renderedFontSize

  if (fontSizeQuery.indexOf('/') !== -1) {
    // we have a line-height parameter
    ;[fontSizeQuery, lineHeight] = fontSizeQuery.split('/')
  }

  if (fontSizeQuery.indexOf('between(') === -1) {
    if (fontSizeQuery.indexOf('(') !== -1) {
      // we have a modifier xs(1.6) --> multiplies the size with 1.6
      modifier = fontSizeQuery.match(/\((.*)\)/)[1]
      fontSizeQuery = fontSizeQuery.split('(')[0]
    }
  }

  const themePath = ['theme', 'typography', 'sizes']
  const fontSize = fontSizeQuery
  const path = fontSize.split('.')

  let resolvedFontsize = _.get(config, themePath.concat(path))
  if (!resolvedFontsize) {
    resolvedFontsize = fontSize
  }

  if (!_.isString(resolvedFontsize)) {
    resolvedFontsize = replaceWildcards(resolvedFontsize, config)
    if (!_.has(resolvedFontsize, breakpoint)) {
      throw node.error(
        `FONTSIZE: No breakpoint \`${breakpoint}\` found in theme.typography.sizes.${fontSize}`,
        { name: breakpoint }
      )
    }
  } else {
    if (resolvedFontsize.indexOf('between(') !== -1) {
      // responsive font size
      return parseRFSQuery(node, config, resolvedFontsize, lineHeight, breakpoint)
    }
  }

  if (!modifier) {
    if (_.isString(resolvedFontsize)) {
      if (!lineHeight && resolvedFontsize.indexOf('/') !== -1) {
        // if the resolvedFontsize has a lineHeight ie `iphone: '4vw/12vw'`
        ;[resolvedFontsize, lineHeight] = resolvedFontsize.split('/')
      }

      if (resolvedFontsize.endsWith('vw')) {
        if (lineHeight && lineHeight.endsWith('vw')) {
          return parseVWQuery(node, config, resolvedFontsize, lineHeight, breakpoint, false)
        } else {
          return {
            ...{
              'font-size': parseVWQuery(
                node,
                config,
                resolvedFontsize,
                lineHeight,
                breakpoint,
                true
              )
            },
            ...(lineHeight && { 'line-height': lineHeight })
          }
        }
      } else if (resolvedFontsize.endsWith('dpx')) {
        const [fs, _fsUnit] = splitUnit(resolvedFontsize)
        const [bpPx, _bpUnit] = splitUnit(config.theme.breakpoints[breakpoint])
        const fsVw = ((fs / bpPx) * 100).toFixed(5)

        if (lineHeight && lineHeight.endsWith('dpx')) {
          const [lh, _fsUnit] = splitUnit(lineHeight)
          const lhVw = ((lh / bpPx) * 100).toFixed(5)

          return parseVWQuery(node, config, `${fsVw}vw`, `${lhVw}vw`, breakpoint, false)
        } else {
          return {
            ...{
              'font-size': parseVWQuery(node, config, `${fsVw}vw`, lineHeight, breakpoint, true)
            },
            ...(lineHeight && { 'line-height': lineHeight })
          }
        }
      } else {
        return {
          ...{ 'font-size': resolvedFontsize },
          ...(lineHeight && { 'line-height': lineHeight })
        }
      }
    }
    let bpFS = resolvedFontsize[breakpoint]
    if (_.isObject(bpFS)) {
      const props = {}
      _.keys(bpFS).forEach(key => {
        const v = bpFS[key]

        if (v.endsWith('vw')) {
          props[key] = parseVWQuery(node, config, v, lineHeight, breakpoint, true)
        } else if (v.endsWith('dpx')) {
          const [fs, _fsUnit] = splitUnit(v)
          const [bpPx, _bpUnit] = splitUnit(config.theme.breakpoints[breakpoint])
          const fsVw = ((fs / bpPx) * 100).toFixed(5)
          props[key] = parseVWQuery(node, config, `${fsVw}vw`, lineHeight, breakpoint, true)
        } else {
          props[key] = v
        }
      })
      return props
    } else {
      if (!lineHeight && bpFS.indexOf('/') !== -1) {
        // if the resolvedFontsize has a lineHeight ie `iphone: '4vw/12vw'`
        ;[bpFS, lineHeight] = bpFS.split('/')
      }

      if (bpFS.indexOf('between(') !== -1) {
        // responsive font size
        return parseRFSQuery(node, config, bpFS, lineHeight, breakpoint)
      }

      if (bpFS.endsWith('vw')) {
        if (lineHeight && lineHeight.endsWith('vw')) {
          return parseVWQuery(node, config, bpFS, lineHeight, breakpoint, false)
        } else {
          return {
            ...{ 'font-size': parseVWQuery(node, config, bpFS, lineHeight, breakpoint, true) },
            ...(lineHeight && { 'line-height': lineHeight })
          }
        }
      }

      if (bpFS.endsWith('dpx')) {
        if (lineHeight && lineHeight.endsWith('vw')) {
          throw node.error(
            `FONTSIZE: Mixing dpx and vw is not allowed with fontsize and lineheight`,
            { name: breakpoint }
          )
        }
        const [fs, _fsUnit] = splitUnit(bpFS)
        let [bpPx, _bpUnit] = splitUnit(config.theme.breakpoints[breakpoint])

        if (bpPx === 0) {
          ;[bpPx, _bpUnit] = splitUnit(
            calcMaxFromBreakpoint(config.theme.breakpoints, breakpoint)
          )
        }

        const fsVw = ((fs / bpPx) * 100).toFixed(5)

        if (lineHeight && lineHeight.endsWith('dpx')) {
          const [lh, _fsUnit] = splitUnit(lineHeight)
          const lhVw = ((lh / bpPx) * 100).toFixed(5)

          return parseVWQuery(node, config, `${fsVw}vw`, `${lhVw}vw`, breakpoint, false)
        }

        return {
          ...{
            'font-size': parseVWQuery(node, config, `${fsVw}vw`, lineHeight, breakpoint, true)
          },
          ...(lineHeight && { 'line-height': lineHeight })
        }
      }

      return {
        ...{ 'font-size': bpFS },
        ...(lineHeight && { 'line-height': lineHeight })
      }
    }
  } else {
    let fs
    if (_.isString(resolvedFontsize)) {
      fs = resolvedFontsize
    } else if (_.isObject(resolvedFontsize[breakpoint])) {
      fs = resolvedFontsize[breakpoint]['font-size']
    } else {
      fs = resolvedFontsize[breakpoint]
    }

    const [val, unit] = splitUnit(fs)
    renderedFontSize = `${val * modifier}${unit}`

    return {
      ...{ 'font-size': renderedFontSize },
      ...(lineHeight && { 'line-height': lineHeight })
    }
  }
}
