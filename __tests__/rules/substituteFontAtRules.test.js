const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('parses @font', () => {
  const input = `
    article {
      @font serif;
    }
  `

  const output = `
    article {
      font-family: Georgia,Cambria,"Times New Roman",Times,serif;
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @font inside @responsive', () => {
  const input = `
    article {
      @responsive xs {
        @font serif;
      }
    }
  `

  const output = `
  @media (width <= 739px) {
    article {
      font-family: Georgia,Cambria,"Times New Roman",Times,serif
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @font with size', () => {
  const input = `
    article {
      @font serif xs;
    }
  `

  const output = `
    article {
      font-family: Georgia, Cambria, Times New Roman, Times, serif;
    }
    @media (width <= 739px) {
      article {
        font-size: 12px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article {
        font-size: 12px;
      }
    }
    @media (width >= 1024px) and (width <= 1398px) {
      article {
        font-size: 12px;
      }
    }
    @media (width >= 1399px) and (width <= 1899px) {
      article {
        font-size: 12px;
      }
    }
    @media (width >= 1900px) {
      article {
        font-size: 14px;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @font with size and breakpoints', () => {
  const input = `
    article {
      @font serif xs/1.53 >=lg;
      @font serif sm(1.2)/1.53 <=sm;
    }
  `

  const output = `
    article {
      font-family: Georgia, Cambria, Times New Roman, Times, serif;
    }
    @media (width <= 739px) {
      article {
        font-size: 16.8px;
        line-height: 1.53;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article {
        font-size: 16.8px;
        line-height: 1.53;
      }
    }
    @media (width >= 1399px) and (width <= 1899px) {
      article {
        font-size: 12px;
        line-height: 1.53;
      }
    }
    @media (width >= 1900px) {
      article {
        font-size: 14px;
        line-height: 1.53;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses hierarchical @font with slash notation', () => {
  const hierarchicalConfig = {
    theme: {
      typography: {
        families: {
          'body/regular': ['Helvetica', 'Arial', 'sans-serif'],
          'body/strong': ['Helvetica Neue', 'Arial', 'sans-serif'],
          'header/display': ['Georgia', 'Times', 'serif']
        }
      }
    }
  }

  const input = `
    article {
      @font body/regular;
    }
    h1 {
      @font header/display;
    }
    strong {
      @font body/strong;
    }
  `

  const output = `
    article {
      font-family: Helvetica,Arial,sans-serif;
    }
    h1 {
      font-family: Georgia,Times,serif;
    }
    strong {
      font-family: Helvetica Neue,Arial,sans-serif;
    }
  `

  return run(input, hierarchicalConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses hierarchical @font with size', () => {
  const hierarchicalConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        families: {
          'body/regular': ['Helvetica', 'Arial', 'sans-serif'],
          'header/display': ['Georgia', 'Times', 'serif']
        },
        sizes: {
          'header/large': {
            xs: '24px',
            sm: '28px',
            md: '32px'
          }
        }
      }
    }
  }

  const input = `
    h1 {
      @font header/display header/large;
    }
  `

  const output = `
    h1 {
      font-family: Georgia,Times,serif;
    }
    @media (width <= 739px) {
      h1 {
        font-size: 24px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      h1 {
        font-size: 28px;
      }
    }
    @media (width >= 1024px) {
      h1 {
        font-size: 32px;
      }
    }
  `

  return run(input, hierarchicalConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('supports slash notation path traversal for @font', () => {
  const pathTraversalConfig = {
    theme: {
      typography: {
        families: {
          // Nested structure (no literal slash keys)
          body: {
            regular: ['Helvetica', 'Arial', 'sans-serif'],
            strong: ['Helvetica Neue', 'Arial', 'sans-serif']
          },
          header: {
            display: ['Georgia', 'Times', 'serif']
          }
        }
      }
    }
  }

  const input = `
    article {
      @font body/regular;
    }
    h1 {
      @font header/display;
    }
    strong {
      @font body/strong;
    }
  `

  const output = `
    article {
      font-family: Helvetica,Arial,sans-serif;
    }
    h1 {
      font-family: Georgia,Times,serif;
    }
    strong {
      font-family: Helvetica Neue,Arial,sans-serif;
    }
  `

  return run(input, pathTraversalConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('prioritizes literal string keys over path traversal for @font', () => {
  const mixedConfig = {
    theme: {
      typography: {
        families: {
          // Literal string key
          'body/regular': ['Custom Font', 'Arial', 'sans-serif'],
          // Nested structure that could be accessed via path traversal
          body: {
            regular: ['Default Font', 'Helvetica', 'sans-serif']
          }
        }
      }
    }
  }

  const input = `
    article {
      @font body/regular;
    }
  `

  // Should use the literal string key (Custom Font), not path traversal (Default Font)
  const output = `
    article {
      font-family: Custom Font,Arial,sans-serif;
    }
  `

  return run(input, mixedConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @font with size in pixels and breakpoints', () => {
  const input = `
    article {
      @font serif 18px/1.25 >=lg;
    }
  `

  const output = `
    article {
      font-family: Georgia, Cambria, Times New Roman, Times, serif;
    }
    @media (width >= 1399px) and (width <= 1899px) {
      article {
        font-size: 18px;
        line-height: 1.25;
      }
    }
    @media (width >= 1900px) {
      article {
        font-size: 18px;
        line-height: 1.25;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
