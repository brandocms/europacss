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
    expect(result.css).toMatch(/normalize\.css/)
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
