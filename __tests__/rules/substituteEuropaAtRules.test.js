const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('imports @europa base', () => {
  const input = `
    @europa base;
  `

  return run(input).then(result => {
    expect(result.css).toMatch(
      /font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";/
    )
    expect(result.css).toMatch(/font-size: 18px;/)
    expect(result.css).toMatch(/normalize\.css/)

    expect(result.css).toMatch(/--font-base-px: 18px;/)
    expect(result.css).toMatch(/--font-base-vw: 18px;/)

    expect(result.css).toMatch(/--breakpoint-xs: 0/)
    expect(result.css).toMatch(/--breakpoint-sm: 740px/)
    expect(result.css).toMatch(/--breakpoint-md: 1024px/)
    expect(result.css).toMatch(/--breakpoint-lg: 1399px/)
    expect(result.css).toMatch(/--breakpoint-xl: 1900px/)

    expect(result.css).toMatch(/--grid-gutter: 25px;/)

    expect(result.warnings().length).toBe(0)
  })
})

it('imports @europa arrows', () => {
  const input = `
    @europa arrows;
  `

  return run(input).then(result => {
    expect(result.css).toMatch(/transform: translateY\(calc\(5px \* -1\)\) translateX\(5px\);/)
    expect(result.warnings().length).toBe(0)
  })
})
