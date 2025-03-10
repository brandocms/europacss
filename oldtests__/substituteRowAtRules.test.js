const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('parses @row', () => {
  const input = `
    article {
      @row;
    }
  `

  const output = `
    article {
      display: flex;
      flex-wrap: nowrap;
    }
    article > *:nth-child(1) {
      margin-left: 0;
    }
    @media (min-width: 0) and (max-width: 739px) {
      article > * {
        margin-left: 25px;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px) {
      article > * {
        margin-left: 35px;
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1900px) {
      article > * {
        margin-left: 60px;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @row with specified children count', () => {
  const input = `
    article {
      @row 3;
    }
  `

  const output = `
    article {
      display: flex;
      flex-wrap: nowrap;
    }
    article > *:nth-child(3n+1) {
      margin-left: 0;
    }
    @media (min-width: 0) and (max-width: 739px) {
      article > * {
        margin-left: 25px;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px) {
      article > * {
        margin-left: 35px;
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1900px) {
      article > * {
        margin-left: 60px;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @row with specified children count and wrap specifier', () => {
  const input = `
    article {
      @row 3/wrap;
    }
  `

  const output = `
    article {
      display: flex;
      flex-wrap: wrap;
    }
    article > *:nth-child(3n+1) {
      margin-left: 0;
    }
    @media (min-width: 0) and (max-width: 739px) {
      article > * {
        margin-left: 25px;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px) {
      article > * {
        margin-left: 35px;
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1900px) {
      article > * {
        margin-left: 60px;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @row with specified children count and wrap specifier nowrap', () => {
  const input = `
    article {
      @row 3/nowrap;
    }
  `

  const output = `
    article {
      display: flex;
      flex-wrap: nowrap;
    }
    article > *:nth-child(3n+1) {
      margin-left: 0;
    }
    @media (min-width: 0) and (max-width: 739px) {
      article > * {
        margin-left: 25px;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px) {
      article > * {
        margin-left: 35px;
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1900px) {
      article > * {
        margin-left: 60px;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @row with specified children count, wrap specifier and gap', () => {
  const input = `
    article {
      @row 3/wrap/sm;
    }
  `

  const output = `
    article {
      display: flex;
      flex-wrap: wrap;
    }
    article > *:nth-child(3n+1) {
      margin-left: 0;
    }
    article > *:nth-child(1), article > *:nth-child(2), article > *:nth-child(3) {
      margin-top: 0;
    }
    @media (min-width: 0) and (max-width: 739px) {
      article > * {
        margin-left: 25px;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px) {
      article > * {
        margin-left: 35px;
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px) {
      article > * {
        margin-left: 50px;
      }
    }
    @media (min-width: 1900px) {
      article > * {
        margin-left: 60px;
      }
    }
    @media (min-width: 0) and (max-width: 739px) {
      article > * {
        margin-top: 20px;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px) {
      article > * {
        margin-top: 25px;
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px) {
      article > * {
        margin-top: 30px;
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px) {
      article > * {
        margin-top: 30px;
      }
    }
    @media (min-width: 1900px) {
      article > * {
        margin-top: 45px;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @row under @responsive', () => {
  const input = `
    article {
      @responsive xs {
        @row 3;
      }
    }
  `

  const output = `
  @media (min-width: 0) and (max-width: 739px) {
    article > * {
      margin-left: 25px;
    }
  }
  @media (min-width: 0) and (max-width: 739px) {
    article {
      display: flex;
      flex-wrap: nowrap;
    }
    article > *:nth-child(3n+1) {
      margin-left: 0;
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @row as child under @responsive', () => {
  const input = `
    .inner {
      article {
        @responsive xs {
          @row 3;
        }
      }
    }
  `

  const output = `
  @media (min-width: 0) and (max-width: 739px) {
    .inner article > * {
      margin-left: 25px;
    }
  }
  @media (min-width: 0) and (max-width: 739px) {
    .inner article {
      display: flex;
      flex-wrap: nowrap;
    }
    .inner article > *:nth-child(3n+1) {
      margin-left: 0;
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @row as child under @responsive w/ advanced bpQuery', () => {
  const input = `
    .inner {
      article {
        @responsive $desktop {
          @row 3;
        }
      }
    }
  `

  const output = `
  @media (min-width: 1024px) and (max-width: 1398px) {
    .inner article > * {
      margin-left: 50px;
    }
  }
  @media (min-width: 1399px) and (max-width: 1899px) {
    .inner article > * {
      margin-left: 50px;
    }
  }
  @media (min-width: 1900px) {
    .inner article > * {
      margin-left: 60px;
    }
  }
  @media (min-width: 1024px) and (max-width: 1398px), (min-width: 1399px) and (max-width: 1899px), (min-width: 1900px) {
    .inner article {
      display: flex;
      flex-wrap: nowrap;
    }
    .inner article > *:nth-child(3n+1) {
      margin-left: 0;
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @row w/ advanced bpQuery', () => {
  const input = `
    .inner {
      article {
        @row 3 $desktop;
      }
    }
  `

  const output = `
  @media (min-width: 1024px) and (max-width: 1398px) {
    .inner article > * {
      margin-left: 50px;
    }
  }
  @media (min-width: 1399px) and (max-width: 1899px) {
    .inner article > * {
      margin-left: 50px;
    }
  }
  @media (min-width: 1900px) {
    .inner article > * {
      margin-left: 60px;
    }
  }
  @media (min-width: 1024px) and (max-width: 1398px), (min-width: 1399px) and (max-width: 1899px), (min-width: 1900px) {
    .inner article {
      display: flex;
      flex-wrap: nowrap;
    }
    .inner article > *:nth-child(3n+1) {
      margin-left: 0;
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
