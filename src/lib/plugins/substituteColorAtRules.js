import _ from 'lodash'
import postcss from 'postcss'
import buildDecl from '../../util/buildDecl'
import buildMediaQueryQ from '../../util/buildMediaQueryQ'
import findResponsiveParent from '../../util/findResponsiveParent'
import extractBreakpointKeys from '../../util/extractBreakpointKeys'

module.exports = getConfig => {
  const config = getConfig()

  return {
    postcssPlugin: 'europacss-color',
    prepare() {
      return {
        AtRule: {
          color: atRule => {
            processRule(atRule, config, false)
          },
          'color!': atRule => {
            processRule(atRule, config, true)
          }
        }
      }
    }
  }
}

module.exports.postcss = true

/**
 * Parse @color parameters, handling CSS functions like var() that may contain spaces
 * @param {string} params - The at-rule parameters string
 * @returns {Array} [target, color, bpQuery]
 */
function parseColorParams(params) {
  const trimmed = params.trim()

  // Find the first space to get the target
  const firstSpaceIdx = trimmed.indexOf(' ')
  if (firstSpaceIdx === -1) {
    return [trimmed, undefined, undefined]
  }

  const target = trimmed.slice(0, firstSpaceIdx)
  const rest = trimmed.slice(firstSpaceIdx + 1).trim()

  // Check if the color value starts with a CSS function (e.g., var(), rgb(), hsl())
  const funcMatch = rest.match(/^([a-zA-Z-]+)\(/)
  if (funcMatch) {
    // Find the matching closing parenthesis
    let depth = 0
    let endIdx = -1
    for (let i = 0; i < rest.length; i++) {
      if (rest[i] === '(') {
        depth++
      } else if (rest[i] === ')') {
        depth--
        if (depth === 0) {
          endIdx = i
          break
        }
      }
    }

    if (endIdx !== -1) {
      const color = rest.slice(0, endIdx + 1)
      const remainder = rest.slice(endIdx + 1).trim()
      const bpQuery = remainder || undefined
      return [target, color, bpQuery]
    }
  }

  // No CSS function detected, use simple space splitting
  const parts = postcss.list.space(rest)
  return [target, parts[0], parts[1]]
}

function processRule(atRule, config, flagAsImportant) {
  const parent = atRule.parent

  if (parent.type === 'root') {
    throw atRule.error(`COLOR: Cannot run from root`, { word: 'color' })
  }

  const {
    theme: { breakpoints, breakpointCollections }
  } = config

  // Parse the rule parameters: target, color, and optional breakpoint query
  let [target, color, bpQuery] = parseColorParams(atRule.params)

  if (!target || !color) {
    throw atRule.error(`COLOR: Must include target (fg/bg) and color property`, { word: 'color' })
  }

  // Clone rule to preserve original for media query creation
  const clonedRule = atRule.clone()

  // Check if we're nested under a @responsive rule
  const responsiveParent = findResponsiveParent(atRule)

  if (responsiveParent) {
    // Under @responsive, we can't have a breakpoint query in @color
    if (bpQuery) {
      throw clonedRule.error(
        `COLOR: @color cannot be nested under @responsive and have a breakpoint query.`,
        { name: bpQuery }
      )
    }
  }

  const src = atRule.source

  // Helper function to create color declaration
  function createColorDecl(target, color, flagAsImportant) {
    // Get the wanted object
    const theme = ['theme', 'colors']
    const path = color.split('.')
    const resolvedColor = _.get(config, theme.concat(path))

    let decl

    switch (target) {
      case 'fg':
        decl = buildDecl('color', resolvedColor || color, flagAsImportant)
        break

      case 'bg':
        decl = buildDecl('background-color', resolvedColor || color, flagAsImportant)
        break

      case 'fill':
        decl = buildDecl('fill', resolvedColor || color, flagAsImportant)
        break

      case 'stroke':
        decl = buildDecl('stroke', resolvedColor || color, flagAsImportant)
        break

      case 'border':
        decl = buildDecl('border-color', resolvedColor || color, flagAsImportant)
        break

      case 'border-top':
        decl = buildDecl('border-top-color', resolvedColor || color, flagAsImportant)
        break

      case 'border-bottom':
        decl = buildDecl('border-bottom-color', resolvedColor || color, flagAsImportant)
        break

      case 'border-left':
        decl = buildDecl('border-left-color', resolvedColor || color, flagAsImportant)
        break

      case 'border-right':
        decl = buildDecl('border-right-color', resolvedColor || color, flagAsImportant)
        break

      default:
        throw atRule.error(
          `COLOR: target must be fg, bg, fill, stroke, border or border-[top|bottom|right|left]. Got \`${target}\``,
          { word: target }
        )
    }

    return decl
  }

  if (bpQuery) {
    // We have a breakpoint query, extract all affected breakpoints
    const affectedBreakpoints = extractBreakpointKeys(
      { breakpoints, breakpointCollections },
      bpQuery
    )

    // For each breakpoint, create a media query with the color declaration
    _.each(affectedBreakpoints, bp => {
      // Create the color declaration
      const colorDecl = createColorDecl(target, color, flagAsImportant)

      // Create a rule with the parent's selector
      const rule = postcss.rule({ selector: parent.selector })
      rule.append(colorDecl)

      // Create media query at-rule
      const mediaRule = postcss.atRule({
        name: 'media',
        params: buildMediaQueryQ({ breakpoints, breakpointCollections }, bp),
        source: src
      })

      // Add the rule to the media query
      mediaRule.append(rule)

      // Insert after the parent rule (at root level)
      parent.after(mediaRule)
    })
  } else {
    // No breakpoint query specified, add directly to parent
    const colorDecl = createColorDecl(target, color, flagAsImportant)
    parent.append(colorDecl)
  }

  // Remove the original @color rule
  atRule.remove()

  // Remove parent if it's now empty
  if (parent && !parent.nodes.length) {
    parent.remove()
  }
}
