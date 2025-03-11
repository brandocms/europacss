// width: =(md/-2);
const postcss = require('postcss')
const plugin = require('../../src')

function run (input, opts) {
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
