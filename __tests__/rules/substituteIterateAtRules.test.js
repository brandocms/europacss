const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

const cfg = {
  theme: {
    breakpoints: {
      xs: '0',
      sm: '740px',
      md: '1024px'
    },
    spacing: {
      md: {
        xs: '25px',
        sm: '50px',
        md: '75px'
      }
    }
  }
}

it('parses @iterate', () => {
  const input = `
    article {
      @iterate theme.spacing.md {
        @responsive $key {
          margin-bottom: $value;
        }
      }
    }
  `

  const output = `
    @media (width <= 739px) {
      article {
        margin-bottom: 25px
      }
    }

    @media (min-width: 740px) and (max-width: 1023px) {
      article {
        margin-bottom: 50px
      }
    }

    @media (min-width: 1024px) {
      article {
        margin-bottom: 75px
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @iterate in context', () => {
  const input = `
    article {
      margin-top: 100px;
      @iterate theme.spacing.md {
        @responsive $key {
          margin-bottom: $value;
        }
      }
    }
  `

  const output = `
    article {
      margin-top: 100px
    }

    @media (width <= 739px) {
      article {
        margin-bottom: 25px
      }
    }

    @media (min-width: 740px) and (max-width: 1023px) {
      article {
        margin-bottom: 50px
      }
    }

    @media (min-width: 1024px) {
      article {
        margin-bottom: 75px
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @iterate as decls', () => {
  const input = `
    :root {
      @iterate theme.breakpoints {
        --breakpoint-$key: $value
      }
    }
  `

  const output = `
    :root {
      --breakpoint-xs: 0;
      --breakpoint-sm: 740px;
      --breakpoint-md: 1024px
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('fails without children', () => {
  const input = `
  body article .test {
      font-size: 18px;
      color: red;

      @iterate;
    }
    `
  expect.assertions(1)
  return run(input).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('fails without params', () => {
  const input = `
  body article .test {
    font-size: 18px;
    color: red;

    @iterate {
      font-size: 55px;
    }
  }
  `
  expect.assertions(1)
  return run(input).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('switches out $key as decl value', () => {
  const input = `
    i.dbg {
      position: fixed;

      &:after {
        text-align: center;

        @iterate theme.breakpoints {
          @responsive $key {
            content: '$key';
          }
        }
      }
    }
  `

  const output = `
    i.dbg {
      position: fixed;
    }

    i.dbg:after {
      text-align: center
    }

    @media (width <= 739px) {
      i.dbg:after {
        content: 'xs';
      }
    }

    @media (min-width: 740px) and (max-width: 1023px) {
      i.dbg:after {
        content: 'sm';
      }
    }

    @media (min-width: 1024px) {
      i.dbg:after {
        content: 'md';
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
