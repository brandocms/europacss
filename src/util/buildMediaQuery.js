import _ from 'lodash'

// builds with MIN only. Fine for when iterating through all breakpoints
// for single breakpoints, use buildSpecificMediaQuery

export default function buildMediaQuery(breakpoints, breakpoint) {
  let screens = breakpoints[breakpoint]

  if (_.isString(screens)) {
    screens = { min: screens }
  }

  if (!Array.isArray(screens)) {
    screens = [screens]
  }

  return _(screens)
    .map(screen => {
      return _(screen)
        .map((value, feature) => {
          // Use modern width syntax instead of min-width/max-width
          if (feature === 'min') {
            return `(width >= ${value})`
          } else if (feature === 'max') {
            return `(width <= ${value})`
          } else {
            return `(${feature}: ${value})`
          }
        })
        .join(' and ')
    })
    .join(', ')
}
