const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

const DEFAULT_CFG = {
  theme: {
    breakpoints: {
      mobile: '0',
      tablet: '740px',
      desktop: '1024px'
    },

    breakpointCollections: {
      $sm: 'mobile/tablet',
      $lg: 'desktop',
      $desktop: 'desktop'
    },

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

it('parses @color with single breakpoint', () => {
  const input = `
    article {
      @color fg green.dark desktop;
    }
  `

  const output = `
    @media (width >= 1024px) {
      article {
        color: #22AA22;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @color with breakpoint collection', () => {
  const input = `
    article {
      @color fg green.dark $lg;
      @color bg green.light $sm;
    }
  `

  const output = `
    @media (width <= 739px) {
      article {
        background-color: #AAFFAA;
      }
    }

    @media (width >= 740px) and (width <= 1023px) {
      article {
        background-color: #AAFFAA;
      }
    }

    @media (width >= 1024px) {
      article {
        color: #22AA22;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @color with range query (>=)', () => {
  const input = `
    article {
      @color bg green.light >=tablet;
    }
  `

  const output = `
    @media (width >= 740px) and (width <= 1023px) {
      article {
        background-color: #AAFFAA;
      }
    }

    @media (width >= 1024px) {
      article {
        background-color: #AAFFAA;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @color with range query (<=)', () => {
  const input = `
    article {
      @color fg gray.100 <=tablet;
    }
  `

  const output = `
    @media (width <= 739px) {
      article {
        color: #111111;
      }
    }

    @media (width >= 740px) and (width <= 1023px) {
      article {
        color: #111111;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @color with multiple breakpoints (slash-separated)', () => {
  const input = `
    article {
      @color fg green.dark mobile/desktop;
    }
  `

  const output = `
    @media (width <= 739px) {
      article {
        color: #22AA22;
      }
    }

    @media (width >= 1024px) {
      article {
        color: #22AA22;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @color! with breakpoints as !important', () => {
  const input = `
    article {
      @color! fg green.dark desktop;
      @color! bg green.light $sm;
    }
  `

  const output = `
    @media (width <= 739px) {
      article {
        background-color: #AAFFAA !important;
      }
    }

    @media (width >= 740px) and (width <= 1023px) {
      article {
        background-color: #AAFFAA !important;
      }
    }

    @media (width >= 1024px) {
      article {
        color: #22AA22 !important;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('throws error when @color has breakpoint query inside @responsive', () => {
  const input = `
    article {
      @responsive $lg {
        @color fg green.dark desktop;
      }
    }
  `

  return run(input, DEFAULT_CFG).catch(error => {
    expect(error.message).toContain(
      'COLOR: @color cannot be nested under @responsive and have a breakpoint query'
    )
  })
})
