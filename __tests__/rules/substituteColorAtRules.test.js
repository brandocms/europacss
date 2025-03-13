const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

const DEFAULT_CFG = {
  theme: {
    colors: {
      green: {
        dark: '#22AA22',
        light: '#AAFFAA',
        test: {
          one: '#ffffff',
          two: '#000000'
        }
      },
      gray: {
        100: '#111111',
        200: '#222222'
      }
    }
  }
}

it('parses @color', () => {
  const input = `
    article {
      @color fg green.dark;
      @color bg green.light;
    }
  `

  const output = `
    article {
      color: #22AA22;
      background-color: #AAFFAA;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @color! as !important', () => {
  const input = `
    article {
      @color! fg green.dark;
      @color! bg green.light;
    }
  `

  const output = `
    article {
      color: #22AA22 !important;
      background-color: #AAFFAA !important;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @color w/number key', () => {
  const input = `
    article {
      @color fg gray.100;
      @color bg gray.200;
    }
  `

  const output = `
    article {
      color: #111111;
      background-color: #222222;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @color w/deep key', () => {
  const input = `
    article {
      @color fg green.test.one;
      @color bg green.test.two;
    }
  `

  const output = `
    article {
      color: #ffffff;
      background-color: #000000;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @color w/deep key inside @responsive', () => {
  const input = `
    article {
      @responsive $desktop {
        @color fg green.test.one;
        @color bg green.test.two;
      }
    }
  `

  const output = `
    @media (min-width: 1024px) {
      article {
        color: #ffffff;
        background-color: #000000
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
