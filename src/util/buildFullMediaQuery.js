import _ from 'lodash'
import calcMaxFromBreakpoint from './calcMaxFromBreakpoint'

// builds with MIN AND MAX

export default function buildFullMediaQuery(breakpoints, breakpoint) {
  const min = breakpoints[breakpoint]
  const max = calcMaxFromBreakpoint(breakpoints, breakpoint)
  let screens = { min, ...(max && { max }) }

  if (!Array.isArray(screens)) {
    screens = [screens]
  }

  return _(screens)
    .map(screen => {
      return _(screen)
        .map((value, feature) => {
          // Use modern width syntax instead of min-width/max-width
          if (feature === 'min') {
            // Skip min constraint if it's 0
            if (value === '0' || value === '0px') {
              return null; // This will be filtered out
            }
            return `(width >= ${value})`
          } else if (feature === 'max') {
            return `(width <= ${value})`
          } else {
            return `(${feature}: ${value})`
          }
        })
        .filter(Boolean) // Remove null values (skipped min: 0)
        .join(' and ')
    })
    .join(', ')
}
