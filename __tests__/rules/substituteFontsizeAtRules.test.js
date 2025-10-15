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

const WILDCARD2_CFG = {
  theme: {
    breakpoints: {
      iphone: '0',
      mobile: '450px',
      ipad_portrait: '740px',
      ipad_landscape: '1024px',
      desktop_md: '1280px',
      desktop_lg: '1440px',
      desktop_xl: '1600px'
    },

    container: {
      maxWidth: {
        iphone: '100%',
        mobile: '100%',
        ipad_portrait: '100%',
        ipad_landscape: '100%',
        desktop_md: '100%',
        desktop_lg: '100%',
        desktop_xl: '100%'
      },

      padding: {
        iphone: '15px',
        mobile: '35px',
        ipad_portrait: '35px',
        ipad_landscape: '35px',
        desktop_md: '50px',
        desktop_lg: '50px',
        desktop_xl: '50px'
      }
    },

    typography: {
      base: '16px',
      lineHeight: {
        iphone: 1.6,
        mobile: 1.6,
        ipad_portrait: 1.6,
        ipad_landscape: 1.6,
        desktop_md: 1.6,
        desktop_lg: 1.6,
        desktop_xl: 1.6
      },
      sizes: {
        header_text: {
          iphone: '17px',
          mobile: '17px',
          ipad_portrait: '17px',
          '*': '1.0vw'
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
    @media (width <= 739px) {
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

  // Use a configuration with viewport sizes defined for all breakpoints to avoid warnings
  const configWithViewportSizes = {
    dpxViewportSize: 1440, // Global reference viewport width for dpx units
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
    },
    dpxViewportSizes: {
      mobile: 1440,
      tablet: 1440,
      desktop: 1440
    }
  }

  return run(input, configWithViewportSizes).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize dpx (single config)', () => {
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
    @media (width <= 739px) {
      article h1 {
        font-size: calc(3.47222vw * var(--ec-zoom));
        line-height: 1.2;
      }
      article h2 {
        font-size: 20px;
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
        font-size: calc(2.43056vw * var(--ec-zoom));
      }
    }
  `

  const DPX_CFG = {
    dpxViewportSize: 1440, // Global reference viewport width for dpx units
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
            mobile: '20px',
            '*': '35dpx'
          }
        }
      }
    }
  }

  return run(input, DPX_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize dpx (single config, same dpx for multiple breakpoints)', () => {
  const input = `
    article {
      h2 {
        @fontsize h2 mobile;
        @fontsize h2 tablet;
        @fontsize h2 desktop;
      }
    }
  `

  const output = `
    @media (width <= 739px) {
      article h2 {
        font-size: calc(2.43056vw * var(--ec-zoom));
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article h2 {
        font-size: calc(2.43056vw * var(--ec-zoom));
      }
    }
    @media (width >= 1024px) {
      article h2 {
        font-size: calc(2.43056vw * var(--ec-zoom));
      }
    }
  `

  const DPX_CFG = {
    dpxViewportSize: 1440, // Global reference viewport width for dpx units
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
          h2: {
            mobile: '35dpx',
            '*': '35dpx'
          }
        }
      }
    }
  }

  return run(input, DPX_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize with per-collection reference viewport widths', () => {
  const input = `
    article {
      h2 {
        @fontsize 20dpx mobile;
        @fontsize 20dpx tablet;
        @fontsize 20dpx desktop;
      }
    }
  `

  const perCollectionConfig = {
    dpxViewportSizes: {
      mobile: 375, // iPhone reference size
      tablet: 768, // iPad reference size
      desktop: 1440, // Desktop reference size

      // Collections
      $test: 768 // Test collection reference size
    },
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
        lineHeight: {
          mobile: 1.6,
          tablet: 1.6,
          desktop: 1.6
        }
      }
    }
  }

  const output = `
    @media (width <= 739px) {
      article h2 {
        font-size: calc(5.33333vw * var(--ec-zoom));
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article h2 {
        font-size: calc(2.60417vw * var(--ec-zoom));
      }
    }
    @media (width >= 1024px) {
      article h2 {
        font-size: calc(1.38889vw * var(--ec-zoom));
      }
    }
  `

  return run(input, perCollectionConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @fontsize with dpx units using breakpoint collections', () => {
  const input = `
    article {
      h2 {
        @fontsize 20dpx $test;
      }
    }
  `

  const perCollectionConfig = {
    dpxViewportSizes: {
      // Collections
      $test: 768 // Test collection reference size
    },
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
        lineHeight: {
          mobile: 1.6,
          tablet: 1.6,
          desktop: 1.6
        }
      }
    }
  }

  const output = `
    @media (width <= 739px) {
      article h2 {
        font-size: calc(2.60417vw * var(--ec-zoom));
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article h2 {
        font-size: calc(2.60417vw * var(--ec-zoom));
      }
    }
  `

  return run(input, perCollectionConfig).then(result => {
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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

it('parses @fontsize config with a wildcard', () => {
  const input = `
    article {
      @fontsize header_text;
    }
  `

  const output = `
    @media (width <= 449px) {
      article {
        font-size: 17px;
      }
    }
    @media (width >= 450px) and (width <= 739px) {
      article {
        font-size: 17px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article {
        font-size: 17px;
      }
    }
    @media (width >= 1024px) and (width <= 1279px) {
      article {
        font-size: calc(1vw * var(--ec-zoom));
      }
    }
    @media (width >= 1280px) and (width <= 1439px) {
      article {
        font-size: calc(1vw * var(--ec-zoom));
      }
    }
    @media (width >= 1440px) and (width <= 1599px) {
      article {
        font-size: calc(1vw * var(--ec-zoom));
      }
    }
    @media (width >= 1600px) {
      article {
        font-size: calc(1vw * var(--ec-zoom));
      }
    }
  `

  return run(input, WILDCARD2_CFG).then(result => {
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px) {
      @media (width <= 739px) {
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
    @media (width <= 739px){
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
    @media (width <= 739px){
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
    @media (width <= 739px) {
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
    @media (width >= 1024px) and (width <= 1899px) {
      [b-tpl=\"case text | list\"] .inner {
        gap: 50px;
      }
    }
    @media (width >= 1399px) {
      [b-tpl=\"case text | list\"] {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding-left: 100px;
        padding-right: 100px;
      }
    }
    @media (width >= 1399px) and (width <= 1899px) {
      [b-tpl=\"case text | list\"] .inner {
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

it('parses hierarchical @fontsize with slash notation', () => {
  const hierarchicalConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px',
        lg: '1399px',
        xl: '1900px'
      },
      typography: {
        sizes: {
          'header/xsmall': {
            xs: '10px',
            sm: '11px',
            md: '12px',
            lg: '13px',
            xl: '14px'
          },
          'header/large': {
            xs: '24px',
            sm: '28px',
            md: '32px',
            lg: '36px',
            xl: '40px'
          },
          'body/regular': {
            xs: '14px',
            sm: '15px',
            md: '16px',
            lg: '17px',
            xl: '18px'
          }
        }
      }
    }
  }

  const input = `
    h1 {
      @fontsize header/large;
    }
    h6 {
      @fontsize header/xsmall;
    }
    p {
      @fontsize body/regular;
    }
  `

  const output = `
    @media (width <= 739px) {
      h1 {
        font-size: 24px;
      }
      h6 {
        font-size: 10px;
      }
      p {
        font-size: 14px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      h1 {
        font-size: 28px;
      }
      h6 {
        font-size: 11px;
      }
      p {
        font-size: 15px;
      }
    }
    @media (width >= 1024px) and (width <= 1398px) {
      h1 {
        font-size: 32px;
      }
      h6 {
        font-size: 12px;
      }
      p {
        font-size: 16px;
      }
    }
    @media (width >= 1399px) and (width <= 1899px) {
      h1 {
        font-size: 36px;
      }
      h6 {
        font-size: 13px;
      }
      p {
        font-size: 17px;
      }
    }
    @media (width >= 1900px) {
      h1 {
        font-size: 40px;
      }
      h6 {
        font-size: 14px;
      }
      p {
        font-size: 18px;
      }
    }
  `

  return run(input, hierarchicalConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('supports slash notation path traversal for @fontsize', () => {
  const pathTraversalConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          // Nested structure (no literal slash keys)
          header: {
            large: {
              xs: '24px',
              sm: '28px',
              md: '32px'
            },
            small: {
              xs: '14px',
              sm: '16px',
              md: '18px'
            }
          },
          body: {
            text: {
              xs: '14px',
              sm: '15px',
              md: '16px'
            }
          }
        }
      }
    }
  }

  const input = `
    h1 {
      @fontsize header/large;
    }
    h6 {
      @fontsize header/small;
    }
    p {
      @fontsize body/text;
    }
  `

  const output = `
    @media (width <= 739px) {
      h1 {
        font-size: 24px;
      }
      h6 {
        font-size: 14px;
      }
      p {
        font-size: 14px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      h1 {
        font-size: 28px;
      }
      h6 {
        font-size: 16px;
      }
      p {
        font-size: 15px;
      }
    }
    @media (width >= 1024px) {
      h1 {
        font-size: 32px;
      }
      h6 {
        font-size: 18px;
      }
      p {
        font-size: 16px;
      }
    }
  `

  return run(input, pathTraversalConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('prioritizes literal string keys over path traversal for @fontsize', () => {
  const mixedConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px'
      },
      typography: {
        sizes: {
          // Literal string key
          'header/large': {
            xs: '30px',
            sm: '35px'
          },
          // Nested structure that could be accessed via path traversal
          header: {
            large: {
              xs: '20px',
              sm: '25px'
            }
          }
        }
      }
    }
  }

  const input = `
    h1 {
      @fontsize header/large;
    }
  `

  // Should use the literal string key (30px/35px), not path traversal (20px/25px)
  const output = `
    @media (width <= 739px) {
      h1 {
        font-size: 30px;
      }
    }
    @media (width >= 740px) {
      h1 {
        font-size: 35px;
      }
    }
  `

  return run(input, mixedConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses hierarchical @fontsize with line-height', () => {
  const hierarchicalConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
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
      @fontsize header/large/1.5;
    }
  `

  const output = `
    @media (width <= 739px) {
      h1 {
        font-size: 24px;
        line-height: 1.5;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      h1 {
        font-size: 28px;
        line-height: 1.5;
      }
    }
    @media (width >= 1024px) {
      h1 {
        font-size: 32px;
        line-height: 1.5;
      }
    }
  `

  return run(input, hierarchicalConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('applies __base__ properties to parent rule outside media queries', () => {
  const baseConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          'body-large': {
            __base__: {
              'line-height': '135.2%',
              'letter-spacing': '-0.02em'
            },
            xs: {
              'font-size': '33px'
            },
            sm: {
              'font-size': '33px'
            },
            md: {
              'font-size': '33px'
            }
          }
        }
      }
    }
  }

  const input = `
    h2 {
      @fontsize body-large;
    }
  `

  const output = `
    h2 {
      line-height: 135.2%;
      letter-spacing: -0.02em;
    }
    @media (width <= 739px) {
      h2 {
        font-size: 33px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      h2 {
        font-size: 33px;
      }
    }
    @media (width >= 1024px) {
      h2 {
        font-size: 33px;
      }
    }
  `

  return run(input, baseConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('__base__ properties can be overridden in breakpoint-specific configs', () => {
  const baseConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          'my-example': {
            __base__: {
              'line-height': '135%'
            },
            xs: {
              'font-size': '20px'
            },
            sm: {
              'font-size': '25px',
              'line-height': '140%'
            },
            md: {
              'font-size': '30px'
            }
          }
        }
      }
    }
  }

  const input = `
    h2 {
      @fontsize my-example;
    }
  `

  const output = `
    h2 {
      line-height: 135%;
    }
    @media (width <= 739px) {
      h2 {
        font-size: 20px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      h2 {
        font-size: 25px;
        line-height: 140%;
      }
    }
    @media (width >= 1024px) {
      h2 {
        font-size: 30px;
      }
    }
  `

  return run(input, baseConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('supports slash notation path traversal for @fontsize', () => {
  const pathTraversalConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          // Nested structure (no literal slash keys)
          header: {
            large: {
              xs: '24px',
              sm: '28px',
              md: '32px'
            },
            small: {
              xs: '14px',
              sm: '16px',
              md: '18px'
            }
          },
          body: {
            text: {
              xs: '14px',
              sm: '15px',
              md: '16px'
            }
          }
        }
      }
    }
  }

  const input = `
    h1 {
      @fontsize header/large;
    }
    h6 {
      @fontsize header/small;
    }
    p {
      @fontsize body/text;
    }
  `

  const output = `
    @media (width <= 739px) {
      h1 {
        font-size: 24px;
      }
      h6 {
        font-size: 14px;
      }
      p {
        font-size: 14px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      h1 {
        font-size: 28px;
      }
      h6 {
        font-size: 16px;
      }
      p {
        font-size: 15px;
      }
    }
    @media (width >= 1024px) {
      h1 {
        font-size: 32px;
      }
      h6 {
        font-size: 18px;
      }
      p {
        font-size: 16px;
      }
    }
  `

  return run(input, pathTraversalConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('prioritizes literal string keys over path traversal for @fontsize', () => {
  const mixedConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px'
      },
      typography: {
        sizes: {
          // Literal string key
          'header/large': {
            xs: '30px',
            sm: '35px'
          },
          // Nested structure that could be accessed via path traversal
          header: {
            large: {
              xs: '20px',
              sm: '25px'
            }
          }
        }
      }
    }
  }

  const input = `
    h1 {
      @fontsize header/large;
    }
  `

  // Should use the literal string key (30px/35px), not path traversal (20px/25px)
  const output = `
    @media (width <= 739px) {
      h1 {
        font-size: 30px;
      }
    }
    @media (width >= 740px) {
      h1 {
        font-size: 35px;
      }
    }
  `

  return run(input, mixedConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('supports function callbacks in __base__ for font-family array', () => {
  const functionConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        families: {
          main: ['Inter', 'system-ui', 'sans-serif'],
          serif: ['Georgia', 'Times', 'serif']
        },
        sizes: {
          'body-text': {
            __base__: {
              'font-family': theme => theme.typography.families.main,
              'letter-spacing': '0.01em'
            },
            xs: '14px',
            sm: '15px',
            md: '16px'
          }
        }
      }
    }
  }

  const input = `
    p {
      @fontsize body-text;
    }
  `

  const output = `
    p {
      font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif;
      letter-spacing: 0.01em;
    }
    @media (width <= 739px) {
      p {
        font-size: 14px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      p {
        font-size: 15px;
      }
    }
    @media (width >= 1024px) {
      p {
        font-size: 16px;
      }
    }
  `

  return run(input, functionConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('supports function callbacks with hierarchical font family references', () => {
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
          heading: {
            __base__: {
              'font-family': theme => theme.typography.families['header/display'],
              'text-transform': 'uppercase'
            },
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
      @fontsize heading;
    }
  `

  const output = `
    h1 {
      font-family: Georgia, Times, serif;
      text-transform: uppercase;
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

it('supports function callbacks with mixed static and function values', () => {
  const mixedConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        families: {
          main: ['Inter', 'sans-serif']
        },
        sizes: {
          'body-mini': {
            __base__: {
              'font-family': theme => theme.typography.families.main,
              'font-size': '15px',
              'letter-spacing': '0.05em',
              'line-height': '141.3%'
            },
            '*': {
              'font-size': '15dpx'
            }
          }
        }
      }
    }
  }

  const input = `
    .small {
      @fontsize body-mini;
    }
  `

  const output = `
    .small {
      font-family: Inter, sans-serif;
      font-size: 15px;
      letter-spacing: 0.05em;
      line-height: 141.3%;
    }
    @media (width <= 739px) {
      .small {
        font-size: calc(1.04167vw * var(--ec-zoom));
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      .small {
        font-size: calc(1.04167vw * var(--ec-zoom));
      }
    }
    @media (width >= 1024px) {
      .small {
        font-size: calc(1.04167vw * var(--ec-zoom));
      }
    }
  `

  return run(input, mixedConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('fails with clear error for unsupported array property in __base__', () => {
  const invalidConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        sizes: {
          test: {
            __base__: {
              color: theme => ['red', 'blue', 'green']
            },
            xs: '14px'
          }
        }
      }
    }
  }

  const input = `
    p {
      @fontsize test;
    }
  `

  expect.assertions(1)
  return run(input, invalidConfig).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('supports function returning string value in __base__', () => {
  const stringFunctionConfig = {
    theme: {
      breakpoints: {
        xs: '0',
        sm: '740px',
        md: '1024px'
      },
      typography: {
        families: {
          main: 'Inter, sans-serif'
        },
        sizes: {
          test: {
            __base__: {
              'font-family': theme => theme.typography.families.main
            },
            xs: '14px',
            sm: '16px',
            md: '18px'
          }
        }
      }
    }
  }

  const input = `
    p {
      @fontsize test;
    }
  `

  const output = `
    p {
      font-family: Inter, sans-serif;
    }
    @media (width <= 739px) {
      p {
        font-size: 14px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      p {
        font-size: 16px;
      }
    }
    @media (width >= 1024px) {
      p {
        font-size: 18px;
      }
    }
  `

  return run(input, stringFunctionConfig).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
