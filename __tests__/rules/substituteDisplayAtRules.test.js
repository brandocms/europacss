const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('parses @display', () => {
  const input = `
    article {
      @display flex;
    }
  `

  const output = `
    article {
      display: flex;
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @display under @responsive', () => {
  const input = `
    article {
      @responsive xs {
        @display flex;
      }
    }
  `

  const output = `
  @media (min-width: 0) and (max-width: 739px) {
    article {
      display: flex
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @display as child under @responsive', () => {
  const input = `
    .inner {
      article {
        @responsive xs {
          @display flex;
        }
      }
    }
  `

  const output = `
  @media (min-width: 0) and (max-width: 739px) {
    .inner article {
      display: flex
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @display as nested child under @responsive', () => {
  const input = `
    .inner {
      article {
        @responsive xs {
          figure {
            @display flex;
          }
        }
      }
    }
  `

  const output = `
  @media (min-width: 0) and (max-width: 739px) {
    .inner article figure {
      display: flex
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @display w/ advanced bpQuery', () => {
  const input = `
    .inner {
      article {
        @display flex $desktop
      }
    }
  `

  const output = `
  @media (min-width: 1024px) and (max-width: 1398px), (min-width: 1399px) and (max-width: 1899px), (min-width: 1900px) {
    .inner article {
      display: flex
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @display w/ advanced bpQuery and flex dir params', () => {
  const input = `
    .inner {
      article {
        @display flex/row $desktop
      }
    }
  `

  const output = `
  @media (min-width: 1024px) and (max-width: 1398px), (min-width: 1399px) and (max-width: 1899px), (min-width: 1900px) {
    .inner article {
      display: flex;
      flex-direction: row
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @display w/ advanced bpQuery and flex dir and wrap params', () => {
  const input = `
    .inner {
      article {
        @display flex/row/wrap $desktop
      }
    }
  `

  const output = `
  @media (min-width: 1024px) and (max-width: 1398px), (min-width: 1399px) and (max-width: 1899px), (min-width: 1900px) {
    .inner article {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses multiple @display w/ advanced bpQuery and flex dir and wrap params', () => {
  const input = `
    .inner {
      article {
        @display flex/row/wrap $desktop;
        @display flex/column/nowrap $mobile;
      }
    }
  `

  const output = `
  @media (min-width: 1024px) and (max-width: 1398px), (min-width: 1399px) and (max-width: 1899px), (min-width: 1900px) {
    .inner article {
      display: flex;
      flex-direction: row;
      flex-wrap: wrap
    }
  }
  @media (min-width: 0) and (max-width: 739px) {
    .inner article {
      display: flex;
      flex-direction: column;
      flex-wrap: nowrap
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
