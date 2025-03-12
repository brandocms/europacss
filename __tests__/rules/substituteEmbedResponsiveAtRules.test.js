const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('parses @embed-responsive', () => {
  const input = `
    article {
      background-color: green;
      @embed-responsive 16/9;
    }
  `

  const output = `
    article {
      background-color: green;
      position: relative;
      width: 100%;
    }
    article::before {
      content: "";
      padding-top: 56.25%;
      display: block;
    }
    article iframe,
      article embed,
      article object,
      article video {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      border: 0;
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
