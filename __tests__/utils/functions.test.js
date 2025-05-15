const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('parses theme() function', () => {
  const cfg = {
    theme: {
      colors: {
        red: '#ff0000'
      }
    }
  }

  const input = `
    article {
      color: theme(colors.red);
    }
  `

  const output = `
    article {
      color: #ff0000;
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses ease() function with valid easing type', () => {
  const input = `
    .element {
      transition: all 300ms ease('power3.out');
    }
  `

  const output = `
    .element {
      transition: all 300ms cubic-bezier(0.165, 0.84, 0.44, 1);
    }
  `

  return run(input, {}).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('throws error for invalid ease() function type', () => {
  const input = `
    .element {
      transition: all 300ms ease('invalid-easing');
    }
  `

  expect.assertions(1)
  return run(input, {}).catch(error => {
    expect(error.message).toContain("Invalid easing function: 'invalid-easing'")
  })
})
