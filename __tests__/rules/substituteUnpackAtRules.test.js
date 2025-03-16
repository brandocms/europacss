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
    container: {
      padding: {
        xs: '25px',
        sm: '5.555556vw',
        md: '5.555556vw'
      }
    },
    columns: {
      count: {
        xs: 4,
        sm: 6,
        md: 12
      },
      gutters: {
        xs: '15px',
        sm: '40px',
        md: '4.1667vw'
      }
    },
    typography: {
      sections: {
        navigation: {
          xs: {
            'font-size': '17px',
            'line-height': '17px',
            'letter-spacing': '0.12rem'
          },
          sm: {
            'font-size': '17px',
            'line-height': '17px',
            'letter-spacing': '0.12rem'
          },
          md: {
            'font-size': '12px',
            'line-height': '12px',
            'letter-spacing': '0.12rem'
          }
        }
      }
    }
  }
}

it('parses @unpack', () => {
  const input = `
    article {
      @unpack theme.typography.sections.navigation;
    }
  `

  const output = `
    @media (width <= 739px) {
      article {
        font-size: 17px;
        line-height: 17px;
        letter-spacing: 0.12rem
      }
    }

    @media (min-width: 740px) and (max-width: 1023px) {
      article {
        font-size: 17px;
        line-height: 17px;
        letter-spacing: 0.12rem
      }
    }

    @media (min-width: 1024px) {
      article {
        font-size: 12px;
        line-height: 12px;
        letter-spacing: 0.12rem
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @unpack containerPadding', () => {
  const input = `
    :root {
      @unpack containerPadding;
    }
  `

  const output = `
    @media (width <= 739px) {
      :root {
        --container-padding: 25px
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      :root {
        --container-padding: 5.555556vw
      }
    }
    @media (width >= 1024px) {
      :root {
        --container-padding: 5.555556vw
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @unpack gridGutter', () => {
  const input = `
    :root {
      @unpack gridGutter;
    }
  `

  const output = `
    @media (width <= 739px) {
      :root {
        --grid-gutter: 15px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      :root {
        --grid-gutter: 40px;
      }
    }
    @media (width >= 1024px) {
      :root {
        --grid-gutter: 4.1667vw;
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses advanced @unpack', () => {
  const cfg2 = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sections: {
          navigation: {
            xs: {
              'font-size': '17px',
              'line-height': '17px',
              'letter-spacing': '0.12rem'
            },
            sm: {
              'font-size': '17px',
              'line-height': '17px',
              'letter-spacing': '0.12rem'
            },
            md: {
              'font-size': '12px',
              'line-height': '12px',
              'letter-spacing': '0.12rem'
            }
          },

          simple: {
            xs: {
              color: 'red'
            },
            sm: {
              color: 'green'
            },
            md: {
              color: 'blue'
            }
          }
        }
      }
    }
  }
  const input = `
    article {
      @unpack theme.typography.sections.navigation;

      h1 {
        color: blue;
        @unpack theme.typography.sections.simple;
      }
    }
  `

  const output = `
    article h1 {
      color: #00f;
    }
    @media (width <= 739px) {
      article {
        letter-spacing: 0.12rem;
        font-size: 17px;
        line-height: 17px;
      }
      article h1 {
        color: red;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article {
        letter-spacing: 0.12rem;
        font-size: 17px;
        line-height: 17px;
      }
      article h1 {
        color: green;
      }
    }
    @media (width >= 1024px) {
      article {
        letter-spacing: 0.12rem;
        font-size: 12px;
        line-height: 12px;
      }
      article h1 {
        color: #00f;
      }
    }
  `

  return run(input, cfg2).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('fails without params', () => {
  const input = `
  @unpack;
  `
  expect.assertions(1)
  return run(input).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})
