const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('parses @order', () => {
  const input = `
    article {
      @order 1;
    }
  `

  const output = `
    article {
      order: 1;
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @order under @responsive', () => {
  const input = `
    article {
      @responsive xs {
        @order 1;
      }
    }
  `

  const output = `
  @media (width <= 739px) {
    article {
      order: 1
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @order as child under @responsive', () => {
  const input = `
    .inner {
      article {
        @responsive xs {
          @order 1;
        }
      }
    }
  `

  const output = `
  @media (width <= 739px) {
    .inner article {
      order: 1
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @order w/ advanced bpQuery', () => {
  const input = `
    .inner {
      article {
        @order 1 $desktop
      }
    }
  `

  const output = `
  @media (min-width: 1024px) {
    .inner article {
      order: 1
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
