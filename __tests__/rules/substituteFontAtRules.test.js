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
  @media (min-width: 0) and (max-width: 739px) {
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
    @media (width >= 0) and (width <= 739px) {
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
    @media (width >= 0) and (width <= 739px) {
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
