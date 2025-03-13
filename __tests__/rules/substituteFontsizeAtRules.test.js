const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

const MAX_PX_CFG = {
  setMaxForVw: true,
  theme: {
    breakpoints: {
      mobile: '0',
      tablet: '740px',
      desktop: '1024px'
    },

    breakpointCollections: {
      $test: 'mobile/tablet',
      $lg: '>=tablet'
    },

    container: {
      maxWidth: {
        mobile: '100%',
        tablet: '100%',
        desktop: '1920px'
      },

      padding: {
        mobile: '15px',
        tablet: '35px',
        desktop: '50px'
      }
    },

    spacing: {
      xs: {
        mobile: '10px',
        tablet: '20px',
        desktop: '30px'
      },
      md: {
        mobile: '15px',
        tablet: '25px',
        desktop: '50px'
      },
      xl: {
        mobile: '25px',
        tablet: '50px',
        desktop: '75px'
      },
      var: {
        mobile: '25px',
        tablet: 'between(50px-100px)',
        desktop: '100px'
      }
    },

    typography: {
      base: '16px',
      lineHeight: {
        mobile: 1.6,
        tablet: 1.6,
        desktop: 1.6
      },
      sizes: {
        xs: {
          mobile: '10px',
          tablet: '12px',
          desktop: '14px'
        },
        sm: {
          mobile: '12px',
          tablet: '14px',
          desktop: '16px'
        },
        base: {
          mobile: '14px',
          tablet: '16px',
          desktop: '18px'
        },
        lg: {
          mobile: '4vw',
          tablet: '3vw',
          desktop: '3vw'
        },
        xl: {
          mobile: '18px',
          tablet: '20px',
          desktop: '22px'
        }
      }
    },

    columns: {
      gutters: {
        mobile: '20px',
        tablet: '30px',
        desktop: '50px'
      }
    }
  }
}

const MAX_PX_PERCENT = {
  setMaxForVw: true,
  theme: {
    breakpoints: {
      mobile: '0',
      tablet: '740px',
      desktop: '1024px'
    },

    breakpointCollections: {
      $test: 'mobile/tablet'
    },

    container: {
      maxWidth: {
        mobile: '100%',
        tablet: '100%',
        desktop: '100%'
      },

      padding: {
        mobile: '15px',
        tablet: '35px',
        desktop: '50px'
      }
    },

    typography: {
      base: '16px',
      lineHeight: {
        mobile: 1.6,
        tablet: 1.6,
        desktop: 1.6
      },
      sizes: {
        lg: {
          mobile: '4vw',
          tablet: '3vw',
          desktop: '3vw'
        }
      }
    }
  }
}

const WILDCARD_CFG = {
  theme: {
    breakpoints: {
      mobile: '0',
      tablet: '740px',
      desktop: '1024px'
    },

    breakpointCollections: {
      $test: 'mobile/tablet'
    },

    container: {
      maxWidth: {
        mobile: '100%',
        tablet: '100%',
        desktop: '1920px'
      },

      padding: {
        mobile: '15px',
        tablet: '35px',
        desktop: '50px'
      }
    },

    typography: {
      base: '16px',
      lineHeight: {
        mobile: 1.6,
        tablet: 1.6,
        desktop: 1.6
      },
      sizes: {
        h0: {
          mobile: '8vw/12vw',
          '*': '4vw/1.2'
        },

        h1: {
          '*': '4vw',
          desktop: '3.5vw'
        },
        h2: {
          '*': '3vw'
        }
      }
    }
  }
}

const DPX_CFG = {
  dpxViewportSize: 1440, // Reference viewport width for dpx units
  theme: {
    breakpoints: {
      mobile: '0',
      tablet: '740px',
      desktop: '1024px'
    },

    breakpointCollections: {
      $test: 'mobile/tablet'
    },

    container: {
      maxWidth: {
        mobile: '100%',
        tablet: '100%',
        desktop: '1920px'
      },

      padding: {
        mobile: '15px',
        tablet: '35px',
        desktop: '50px'
      }
    },

    typography: {
      base: '16px',
      lineHeight: {
        mobile: 1.6,
        tablet: 1.6,
        desktop: 1.6
      },
      sizes: {
        h0: {
          mobile: '50dpx/1.2',
          '*': '95dpx/1.2'
        },
        h2: {
          mobile: '25dpx',
          tablet: '35dpx',
          desktop: '45dpx'
        }
      }
    }
  }
}

it('parses @fontsize dpx', () => {
  const input = `
    article {
      h1 {
        @fontsize h0;
      }

      h2 {
        @fontsize h2 mobile;
        @fontsize h2 tablet;
        @fontsize h2 desktop;
      }
    }
  `

  const output = `
    @media (width >= 0) and (width <= 739px) {
      article h1 {
        font-size: calc(3.47222vw * var(--ec-zoom));
        line-height: 1.2;
      }
      article h2 {
        font-size: calc(1.73611vw * var(--ec-zoom));
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article h1 {
        font-size: calc(6.59722vw * var(--ec-zoom));
        line-height: 1.2;
      }
      article h2 {
        font-size: calc(2.43056vw * var(--ec-zoom));
      }
    }
    @media (width >= 1024px) {
      article h1 {
        font-size: calc(6.59722vw * var(--ec-zoom));
        line-height: 1.2;
      }
      article h2 {
        font-size: calc(3.125vw * var(--ec-zoom));
      }
    }
  `

  return run(input, DPX_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('fails on root', () => {
  const input = `
    @fontsize base;
  `

  expect.assertions(1)
  return run(input).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('parses @fontsize config with line-height', () => {
  const input = `
    article {
      @fontsize h0;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: calc(8vw * var(--ec-zoom));
        line-height: calc(12vw * var(--ec-zoom))
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(4vw * var(--ec-zoom));
        line-height: 1.2
      }
    }
    @media (min-width: 1024px){
      article{
        font-size: calc(4vw * var(--ec-zoom));
        line-height: 1.2
      }
    }
  `

  return run(input, WILDCARD_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize config with wildcards and regular prop', () => {
  const input = `
    article {
      @fontsize h1;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: calc(4vw * var(--ec-zoom))
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(4vw * var(--ec-zoom))
      }
    }
    @media (min-width: 1024px){
      article{
        font-size: calc(3.5vw * var(--ec-zoom))
      }
    }
  `

  return run(input, WILDCARD_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize config with only wildcards', () => {
  const input = `
    article {
      @fontsize h2;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: calc(3vw * var(--ec-zoom))
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(3vw * var(--ec-zoom))
      }
    }
    @media (min-width: 1024px){
      article{
        font-size: calc(3vw * var(--ec-zoom))
      }
    }
  `

  return run(input, WILDCARD_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize config with max px', () => {
  const input = `
    article {
      @fontsize lg;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: calc(4vw * var(--ec-zoom))
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(3vw * var(--ec-zoom))
      }
    }
    @media (min-width: 1024px){
      article{
        font-size: 57.599999999999994px
      }
    }
  `

  return run(input, MAX_PX_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize config with max px for largest coll', () => {
  const input = `
    article {
      @fontsize lg $lg;
    }
  `

  const output = `
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(3vw * var(--ec-zoom))
      }
    }
    @media (min-width: 1024px){
      article{
        font-size: 57.599999999999994px
      }
    }
  `

  return run(input, MAX_PX_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize vw with max px', () => {
  const input = `
    article {
      @fontsize 4vw;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: calc(4vw * var(--ec-zoom))
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(4vw * var(--ec-zoom))
      }
    }
    @media (min-width: 1024px){
      article{
        font-size: 76.8px
      }
    }
  `

  return run(input, MAX_PX_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize vw with max px and vw lineheight', () => {
  const input = `
    article {
      @fontsize 4vw/4vw;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: calc(4vw * var(--ec-zoom));
        line-height: calc(4vw * var(--ec-zoom))
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(4vw * var(--ec-zoom));
        line-height: calc(4vw * var(--ec-zoom))
      }
    }
    @media (min-width: 1024px){
      article{
        font-size: 76.8px;
        line-height: 76.8px
      }
    }
  `

  return run(input, MAX_PX_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('fails @fontsize with max px and percentage based max container size', () => {
  const input = `
    article {
      @fontsize lg;
    }
  `

  expect.assertions(1)
  return run(input, MAX_PX_PERCENT).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('parses @fontsize without max px', () => {
  const input = `
    article {
      @fontsize lg;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: calc(4vw * var(--ec-zoom))
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(3vw * var(--ec-zoom))
      }
    }
    @media (min-width: 1024px){
      article{
        font-size: calc(3vw * var(--ec-zoom))
      }
    }
  `

  return run(input, { ...MAX_PX_CFG, setMaxForVw: false }).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses regular @fontsize for all breakpoints', () => {
  const input = `
    article {
      @fontsize lg;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 19px
      }
    }

    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: 21px
      }
    }

    @media (min-width: 1024px) and (max-width: 1398px){
      article{
        font-size: 21px
      }
    }

    @media (min-width: 1399px) and (max-width: 1899px){
      article{
        font-size: 21px
      }
    }

    @media (min-width: 1900px){
      article{
        font-size: 22px
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses regular @fontsize for single breakpoint', () => {
  const input = `
    article {
      @fontsize lg xs;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 19px
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses hardcoded @fontsize for single breakpoint', () => {
  const input = `
    article {
      @fontsize 50px xs;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 50px
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses regular @fontsize for single breakpoint with line-height', () => {
  const input = `
    article {
      @fontsize lg/2.0 xs;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 19px;
        line-height: 2.0
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses regular @fontsize for single breakpoint with line-height and modifier', () => {
  const input = `
    article {
      @fontsize lg(2.0)/2.0 xs;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 38px;
        line-height: 2.0
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses regular @fontsize for all breakpoints with line-height and modifier', () => {
  const input = `
    article {
      @fontsize lg(2.0)/2.0;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 38px;
        line-height: 2.0
      }
    }

    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: 42px;
        line-height: 2.0
      }
    }

    @media (min-width: 1024px) and (max-width: 1398px){
      article{
        font-size: 42px;
        line-height: 2.0
      }
    }

    @media (min-width: 1399px) and (max-width: 1899px){
      article{
        font-size: 42px;
        line-height: 2.0
      }
    }

    @media (min-width: 1900px){
      article{
        font-size: 44px;
        line-height: 2.0
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses regular @fontsize for all breakpoints with modifier and no line-height', () => {
  const input = `
    article {
      @fontsize lg(2.0);
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 38px
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: 42px
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px){
      article{
        font-size: 42px
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px){
      article{
        font-size: 42px
      }
    }
    @media (min-width: 1900px){
      article{
        font-size: 44px
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses regular @fontsize for single breakpoint with modifier and no line-height', () => {
  const input = `
    article {
      @fontsize lg(2.0) xs;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 38px
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize correctly inside @responsive', () => {
  const CFG = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        families: {
          serif: 'SerifFont, serif'
        },

        sizes: {
          base: {
            sm: {
              'font-size': '17px',
              'line-height': '1.3'
            },
            md: {
              'font-size': '19px',
              'line-height': '1.3'
            }
          }
        }
      }
    }
  }

  const input = `
    @responsive >=sm {
      h1 {
        @fontsize base/1;
        font-family: theme(typography.families.serif);
      }
    }
  `

  const output = `
    @media (width >= 740px) {
      h1 {
        font-family: SerifFont, serif;
      }
      @media (width >= 740px) and (width <= 1023px) {
        h1 {
          font-size: 17px;
          line-height: 1.3;
        }
      }
      @media (width >= 1024px) {
        h1 {
          font-size: 19px;
          line-height: 1.3;
        }
      }
    }
  `

  return run(input, CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses object @fontsize for single breakpoint', () => {
  const cfg = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          base: {
            xs: {
              'font-size': '17px',
              'line-height': '24px',
              'letter-spacing': '0.98px'
            },
            sm: '19px'
          }
        }
      }
    }
  }

  const input = `
    article {
      @fontsize base xs;
      @fontsize base sm;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 17px;
        line-height: 24px;
        letter-spacing: 0.98px
      }
    }

    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: 19px
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses between() @fontsize for single breakpoint', () => {
  const cfg = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          variable: {
            sm: 'between(20px-30px)'
          }
        }
      }
    }
  }

  const input = `
    article {
      @fontsize variable sm;
    }
  `

  const output = `
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(20px + 10 * ((100vw - 740px) / 283))
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses vw fonts to add scale var', () => {
  const cfg = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          variable: {
            sm: '4vw'
          }
        }
      }
    }
  }

  const input = `
    article {
      @fontsize variable sm;
    }
  `

  const output = `
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(4vw * var(--ec-zoom))
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses fontsize objects with vw to use scale var', () => {
  const cfg = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          variable: {
            sm: {
              'font-size': '4vw',
              'line-height': '4vw'
            }
          }
        }
      }
    }
  }

  const input = `
    article {
      @fontsize variable sm;
    }
  `

  const output = `
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(4vw * var(--ec-zoom));
        line-height: calc(4vw * var(--ec-zoom))
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('runs correctly inside @responsive', () => {
  const input = `
    article {
      @responsive xs {
        @fontsize lg;
      }
    }
  `

  const output = `
    @media (width >= 0) and (width <= 739px) {
      @media (width >= 0) and (width <= 739px) {
        article {
          font-size: 19px;
        }
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('fails inside @responsive with own breakpointQuery', () => {
  const input = `
    article {
      @responsive xs {
        @fontsize lg >=md;
      }
    }
  `

  expect.assertions(1)
  return run(input).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('parses a selector path', () => {
  const cfg = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          product: {
            name: {
              xs: '14px',
              sm: '16px'
            }
          }
        }
      }
    }
  }

  const input = `
    article {
      @fontsize product.name xs;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 14px
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses between() with line height', () => {
  const cfg = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      }
    }
  }

  const input = `
    article {
      @fontsize between(12px-16px)/2.0 sm;
    }
  `

  const output = `
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(12px + 4 * ((100vw - 740px) / 283));
        line-height: 2.0
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses between() without line height', () => {
  const cfg = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      }
    }
  }

  const input = `
    article {
      @fontsize between(12px-16px) sm;
    }
  `

  const output = `
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: calc(12px + 4 * ((100vw - 740px) / 283))
      }
    }
  `

  return run(input, cfg).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('can mix @fontsize with and without breakpoint', () => {
  const input = `
    article {
      @fontsize xl;
      @fontsize 8vw xs;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        font-size: 20px;
        font-size: calc(8vw * var(--ec-zoom))
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        font-size: 25px
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px){
      article{
        font-size: 28px
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px){
      article{
        font-size: 28px
      }
    }
    @media (min-width: 1900px){
      article{
        font-size: 38px
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('can mix @fontsize with and without breakpoint', () => {
  const input = `
    [b-tpl="case text | list"] {
      @space container;

      .inner {
        @display flex lg;
        @display flex sm;
        @space gap 1;
        align-items: flex-start;

        > .text {
          @column 8/12 lg;
          @column 7:1/12 sm;
          @space padding-right 3:1/12 lg;
          @column-offset 1:1/12 lg;
          @fontsize body;

          &[data-large-text] {
            @font main h3;
            @responsive sm {
              font-size: 20px;
            }
            @space padding-right 1:3/12 lg;

            [data-script="article"] & {
              @font main artikkel_ingress;
              @responsive sm {
                font-size: 20px;
              }
            }
          }
        }

        .list {
          @column 2.75/12 lg;
          @column 3/12 sm;
          /* background: var(--White, #FFF);
          box-shadow: 1px 2px 5px 0px rgba(69, 69, 61, 0.10); */
          /* background: var(--Off-White, #fffefb);
          box-shadow: 0px 4px 10px 0px rgba(69, 69, 61, 0.05); */
          background-color: #f7f5ed;
          @space padding-top 20px;
          @space padding-bottom 24px;
          @space padding-left 20px;
          @space padding-right 28px;
          border-radius: 8px;
          @space margin-top 20px sm;

          .paragraph {
            @display flex/column;
            @space row-gap 10px;
          }

          ul {
            @display flex/column;
            @space row-gap 15px;
            @fontsize 16px;
            padding-top: 10px;

            &:first-child {
              padding-top: 0;
            }
          }
        }
      }
    }
  `

  const output = `
    [b-tpl=\"case text | list\"] .inner {
      align-items: flex-start;
    }
    [b-tpl=\"case text | list\"] .inner > .text[data-large-text],
    [data-script=\"article\"] [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
      font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial,
        sans-serif, Apple Color Emoji, Segoe UI Emoji, Segoe UI Symbol, Noto Color Emoji;
    }
    [b-tpl=\"case text | list\"] .inner .list {
      background-color: #f7f5ed;
      border-radius: 8px;
      padding: 20px 28px 24px 20px;
    }
    [b-tpl=\"case text | list\"] .inner .list .paragraph {
      flex-direction: column;
      row-gap: 10px;
      display: flex;
    }
    [b-tpl=\"case text | list\"] .inner .list ul {
      flex-direction: column;
      row-gap: 15px;
      padding-top: 10px;
      display: flex;
    }
    [b-tpl=\"case text | list\"] .inner .list ul:first-child {
      padding-top: 0;
    }
    @media (width >= 0) and (width <= 739px) {
      [b-tpl=\"case text | list\"] {
        width: 100%;
        max-width: 740px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 15px;
        padding-right: 15px;
      }
      [b-tpl=\"case text | list\"] .inner {
        gap: 25px;
      }
      [b-tpl=\"case text | list\"] .inner > .text {
        font-size: body;
      }
      [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: h3;
      }
      [data-script=\"article\"] [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: artikkel_ingress;
      }
      [b-tpl=\"case text | list\"] .inner .list ul {
        font-size: 16px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      [b-tpl=\"case text | list\"] {
        width: 100%;
        max-width: 1024px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 35px;
        padding-right: 35px;
      }
      [b-tpl=\"case text | list\"] .inner {
        gap: 35px;
        display: flex;
      }
      [b-tpl=\"case text | list\"] .inner > .text {
        max-width: calc(58.3333% + 20.4167px);
        font-size: body;
        flex: 0 0 calc(58.3333% + 20.4167px);
        position: relative;
      }
      [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: h3;
        font-size: 20px;
      }
      [data-script=\"article\"] [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: artikkel_ingress;
        font-size: 20px;
      }
      [b-tpl=\"case text | list\"] .inner .list {
        flex: 0 0 calc(25% - 26.25px);
        max-width: calc(25% - 26.25px);
        margin-top: 20px;
        position: relative;
      }
      [b-tpl=\"case text | list\"] .inner .list ul {
        font-size: 16px;
      }
    }
    @media (width >= 1024px) and (width <= 1398px) {
      [b-tpl=\"case text | list\"] {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding-left: 50px;
        padding-right: 50px;
      }
      [b-tpl=\"case text | list\"] .inner {
        gap: 50px;
      }
      [b-tpl=\"case text | list\"] .inner > .text {
        font-size: body;
      }
      [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: h3;
      }
      [data-script=\"article\"] [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: artikkel_ingress;
      }
      [b-tpl=\"case text | list\"] .inner .list ul {
        font-size: 16px;
      }
    }
    @media (width >= 1399px) and (width <= 1899px) {
      [b-tpl=\"case text | list\"] {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding-left: 100px;
        padding-right: 100px;
      }
      [b-tpl=\"case text | list\"] .inner {
        gap: 50px;
        display: flex;
      }
      [b-tpl=\"case text | list\"] .inner > .text {
        max-width: calc(66.6667% - 16.6667px);
        font-size: body;
        flex: 0 0 calc(66.6667% - 16.6667px);
        margin-left: calc(8.33333% + 4.16667px);
        padding-right: calc(25% + 12.5px);
        position: relative;
      }
      [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: h3;
        padding-right: calc(8.33333% + 104.167px);
      }
      [data-script=\"article\"] [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: artikkel_ingress;
      }
      [b-tpl=\"case text | list\"] .inner .list {
        flex: 0 0 calc(22.9167% - 38.5417px);
        max-width: calc(22.9167% - 38.5417px);
        position: relative;
      }
      [b-tpl=\"case text | list\"] .inner .list ul {
        font-size: 16px;
      }
    }
    @media (width >= 1900px) {
      [b-tpl=\"case text | list\"] {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding-left: 100px;
        padding-right: 100px;
      }
      [b-tpl=\"case text | list\"] .inner {
        gap: 60px;
      }
      [b-tpl=\"case text | list\"] .inner > .text {
        font-size: body;
      }
      [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: h3;
      }
      [data-script=\"article\"] [b-tpl=\"case text | list\"] .inner > .text[data-large-text] {
        font-size: artikkel_ingress;
      }
      [b-tpl=\"case text | list\"] .inner .list ul {
        font-size: 16px;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
