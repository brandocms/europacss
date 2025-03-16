const postcss = require('postcss')
const europa = require('../../src/index')

function run(input, presetEnvOpts = {}) {
  return postcss([europa({ presetEnv: presetEnvOpts })]).process(input, { from: undefined })
}

describe('postcss-preset-env integration', () => {
  test('enables preset-env by default', async () => {
    const input = `.test { border-radius: 5px; }`
    const output = await run(input)

    // Output should contain the original property since we're not forcing prefixes
    expect(output.css).toContain('border-radius: 5px')
  })

  test('@media query', async () => {
    const input = `@media (width >= 1024px) and (width <= 1899px) { article { border-radius: 5px } }`
    const output = await run(input, {
      browsers: ['ie 10'],
      features: {
        autoprefixer: { flexbox: 'no-2009' }
      }
    })

    // Output should contain the original property since we're not forcing prefixes
    expect(output.css).toContain('(min-width: 1024px) and (max-width: 1899px)')
  })

  test('allows disabling preset-env', async () => {
    const input = `.test { border-radius: 5px; }`
    const output = await run(input, { disable: true })

    // Output should be identical to input since preset-env is disabled
    expect(output.css).toContain('border-radius: 5px')
  })

  test('accepts browsers option for autoprefixer', async () => {
    const input = `.test { display: flex; }`
    const output = await run(input, {
      browsers: ['ie 10'],
      features: {
        autoprefixer: { flexbox: 'no-2009' }
      }
    })

    // With IE 10 target, autoprefixer should add prefixes for flexbox
    expect(output.css).toContain('display: -ms-flexbox')
  })
})
