export default function replaceWildcards (obj, config) {
  const objKeys = Object.keys(obj)
  const foundBp = objKeys.find(bp => bp === '*')
  if (foundBp) {
    const wildcardValue = obj[foundBp]
    const allBps = Object.keys(config.theme.breakpoints)
    const missingBps = allBps.filter(function (v) {
      return !objKeys.includes(v)
    })
    missingBps.forEach(missingBp => {
      obj[missingBp] = wildcardValue
    })
    delete obj['*']
  }

  return obj
}
