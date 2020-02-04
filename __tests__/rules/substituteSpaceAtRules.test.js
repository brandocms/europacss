import postcss from 'postcss'

const plugin = require('../../src')

function run (input, opts) {
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
      $test: 'mobile/tablet'
    },

    container: {
      maxWidth: {
        mobile: '740px',
        tablet: '1024px',
        desktop: '100%'
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
          mobile: '16px',
          tablet: '18px',
          desktop: '20px'
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

it('parses @space per mq size', () => {
  const input = `
    body article .test {
      @space margin-top md;
      font-size: 18px;
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
    }

    @media (min-width: 0){
      body article .test {
        margin-top: 15px;
      }
    }

    @media (min-width: 740px){
      body article .test {
        margin-top: 25px;
      }
    }

    @media (min-width: 1024px){
      body article .test {
        margin-top: 50px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space only for requested bp', () => {
  const input = `
    body article .test {
      @space margin-top xl desktop;
      font-size: 18px;
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
    }

    @media (min-width: 1024px){
      body article .test {
        margin-top: 75px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space! only for requested bp', () => {
  const input = `
    body article .test {
      @space! margin-top md mobile;
      font-size: 18px;
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
    }

    @media (min-width: 0) and (max-width: 739px){
      body article .test {
        margin-top: 15px !important;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space for theme(..)', () => {
  const input = `
    body article .test {
      @space margin-top vertical-rhythm(theme.typography.sizes.xl) mobile;
    }

    body article .test {
      @space margin-top vertical-rhythm(theme.typography.sizes.xl, 1.2) mobile;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      body article .test{
        margin-top: calc(18px * 1.6)
      }
    }

    @media (min-width: 0) and (max-width: 739px){
      body article .test{
        margin-top: calc(18px * 1.2)
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space for fraction', () => {
  const input = `
    article {
      @space margin-top 6/12 mobile;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }
    @media (min-width: 0) and (max-width: 739px){
      article {
        margin-top: calc(50% - 10px);
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space for fraction with gutter multiplier', () => {
  const input = `
    article {
      @space margin-top 6:-1/12;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }
    @media (min-width: 0){
      article {
        margin-top: calc(50% - 30px);
      }
    }
    @media (min-width: 740px){
      article {
        margin-top: calc(50% - 45px);
      }
    }
    @media (min-width: 1024px){
      article {
        margin-top: calc(50% - 75px);
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses advanced @responsive @space for fraction with gutter multiplier', () => {
  const CFG = {
    theme: {
      breakpoints: {
        iphone: '0',
        mobile: '480px',
        ipad_portrait: '768px',
        ipad_landscape: '1024px',
        desktop_md: '1200px',
        desktop_lg: '1560px',
        desktop_xl: '1920px'
      },
      columns: {
        count: {
          iphone: 2,
          mobile: 2,
          ipad_portrait: 6,
          ipad_landscape: 6,
          desktop_md: 6,
          desktop_lg: 6,
          desktop_xl: 6
        },
        gutters: {
          iphone: '40px',
          mobile: '40px',
          ipad_portrait: '35px',
          ipad_landscape: '70px',
          desktop_md: '80px',
          desktop_lg: '100px',
          desktop_xl: '120px'
        }
      }
    }
  }

  const input = `
    article {
      @responsive >=ipad_portrait {
        @space margin-top 1:1/6;
      }
    }
  `

  const output = `
    @media (min-width: 768px) and (max-width: 1023px){
      article{
        margin-top: calc(16.6666666667% + 5.8333333333px)
      }
    }
    @media (min-width: 1024px) and (max-width: 1199px){
      article{
        margin-top: calc(16.6666666667% + 11.6666666667px)
      }
    }
    @media (min-width: 1200px) and (max-width: 1559px){
      article{
        margin-top: calc(16.6666666667% + 13.3333333333px)
      }
    }
    @media (min-width: 1560px) and (max-width: 1919px){
      article{
        margin-top: calc(16.6666666667% + 16.6666666667px)
      }
    }
    @media (min-width: 1920px){
      article{
        margin-top: calc(16.6666666667% + 20px)
      }
    }
  `

  return run(input, CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space for fraction of breakpoint key', () => {
  const input = `
    article {
      @space margin-top xs/2 mobile;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }

    @media (min-width: 0) and (max-width: 739px){
      article {
        margin-top: calc(10px/2);
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space for 0.5 of gutter', () => {
  const input = `
    article {
      @space margin-top 0.5 mobile;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }

    @media (min-width: 0) and (max-width: 739px){
      article {
        margin-top: 10px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space for 1.5 of gutter', () => {
  const input = `
    article {
      @space margin-top 1.5 mobile;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }

    @media (min-width: 0) and (max-width: 739px){
      article {
        margin-top: 30px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space for fraction of breakpoint key for all breakpoints', () => {
  const input = `
    article {
      @space margin-top xs/2;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }

    @media (min-width: 0){
      article {
        margin-top: calc(10px/2);
      }
    }

    @media (min-width: 740px){
      article {
        margin-top: calc(20px/2);
      }
    }

    @media (min-width: 1024px){
      article {
        margin-top: calc(30px/2);
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('@space with fraction and no breakpointQuery', () => {
  const input = `
    article {
      @space margin-left 6/12;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }
    @media (min-width: 0){
      article {
        margin-left: calc(50% - 10px);
      }
    }
    @media (min-width: 740px){
      article {
        margin-left: calc(50% - 15px);
      }
    }
    @media (min-width: 1024px){
      article {
        margin-left: calc(50% - 25px);
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space as gutter multiplier for regular number', () => {
  const input = `
    article {
      @space padding-left 1 mobile;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }

    @media (min-width: 0) and (max-width: 739px){
      article {
        padding-left: 20px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space as negative gutter multiplier for regular number', () => {
  const input = `
    article {
      @space padding-left -1 mobile;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }

    @media (min-width: 0) and (max-width: 739px){
      article {
        padding-left: -20px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space as gutter multiplier for regular number across bps', () => {
  const input = `
    article {
      @space padding-left 1;
      font-size: 18px;
    }
  `

  const output = `
    article {
      font-size: 18px;
    }

    @media (min-width: 0){
      article {
        padding-left: 20px;
      }
    }

    @media (min-width: 740px){
      article {
        padding-left: 30px;
      }
    }

    @media (min-width: 1024px){
      article {
        padding-left: 50px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space with no max for last bp', () => {
  const input = `
    body article .test {
      @space margin-top md desktop;
      font-size: 18px;
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
    }

    @media (min-width: 1024px){
      body article .test {
        margin-top: 50px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space 0 w/o breakpoints', () => {
  const input = `
    article {
      @space margin-y 0;
    }
  `

  const output = `
    article {
      margin-top: 0;
      margin-bottom: 0;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space 0 w/ breakpoint', () => {
  const input = `
    article {
      @space margin-y 0 mobile;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        margin-top: 0;
        margin-bottom: 0
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space shortcuts margin', () => {
  const input = `
    article {
      @space margin 0;
    }
  `

  const output = `
    article {
      margin-left: 0;
      margin-right: 0;
      margin-top: 0;
      margin-bottom: 0;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space shortcuts padding', () => {
  const input = `
    article {
      @space padding 0;
    }
  `

  const output = `
    article {
      padding-left: 0;
      padding-right: 0;
      padding-top: 0;
      padding-bottom: 0;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space shortcuts padding-y', () => {
  const input = `
    article {
      @space padding-y 0;
    }
  `

  const output = `
    article {
      padding-top: 0;
      padding-bottom: 0;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space with q', () => {
  const input = `
    body article .test {
      @space margin-top xl <=tablet;
      font-size: 18px;
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
    }

    @media (min-width: 0) and (max-width: 739px){
      body article .test {
        margin-top: 25px;
      }
    }

    @media (min-width: 740px) and (max-width: 1023px){
      body article .test {
        margin-top: 50px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space with > *', () => {
  const input = `
    article {
      display: flex;
      flex-wrap: nowrap;

      > * {
        @space margin-left 2;

        &:first-of-type {
          margin-left: 0;
        }
      }
    }
  `

  const output = `
    article {
      display: flex;
      flex-wrap: nowrap;
    }

    article > *:first-of-type {
      margin-left: 0;
    }

    @media (min-width: 0){
      article > * {
        margin-left: 40px;
      }
    }

    @media (min-width: 740px){
      article > * {
        margin-left: 60px;
      }
    }

    @media (min-width: 1024px){
      article > * {
        margin-left: 100px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space with multiple split bps', () => {
  const input = `
    body article .test {
      @space margin-top xl mobile/desktop;
      font-size: 18px;
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
    }

    @media (min-width: 0) and (max-width: 739px){
      body article .test {
        margin-top: 25px;
      }
    }

    @media (min-width: 1024px){
      body article .test {
        margin-top: 75px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space per mq size with shortcuts', () => {
  const input = `
    body {
      @space margin-y xl;
    }
  `
  const output = `
    @media (min-width: 0){
      body{
        margin-top: 25px;
        margin-bottom: 25px
      }
    }

    @media (min-width: 740px){
      body{
        margin-top: 50px;
        margin-bottom: 50px
      }
    }

    @media (min-width: 1024px){
      body{
        margin-top: 75px;
        margin-bottom: 75px
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('works inside @responsive', () => {
  const input = `
    article {
      @responsive mobile {
        @space margin-top xl;
      }
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        margin-top: 25px
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
  })
})

it('can use container as size', () => {
  const input = `
    article {
      @space margin-left container mobile;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        margin-left: 15px
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('works inside @responsive with q string', () => {
  const input = `
    article {
      @responsive >=tablet {
        @space margin-top xl;
      }
    }
  `

  const output = `
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        margin-top: 50px
      }
    }

    @media (min-width: 1024px){
      article{
        margin-top: 75px
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
  })
})

it('works inside @responsive as dbl parent', () => {
  const input = `
    @responsive mobile {
      article {
        @space margin-top xl;
      }
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        margin-top: 25px
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('fails with bp query inside @responsive', () => {
  const input = `
    article {
      @responsive mobile {
        @space margin-top xl >=tablet;
      }
    }
  `

  expect.assertions(1)
  return run(input, DEFAULT_CFG).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('can run from @responsive root', () => {
  const input = `
    @responsive desktop {
      .alert-yellow {
        @space margin-top xs;
      }
    }
  `

  const output = `
    @media (min-width: 1024px){
      .alert-yellow{
        margin-top: 30px
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space with breakpointCollection', () => {
  const input = `
    body article .test {
      @space margin-top xl $test;
      font-size: 18px;
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
    }

    @media (min-width: 0) and (max-width: 739px){
      body article .test {
        margin-top: 25px;
      }
    }

    @media (min-width: 740px) and (max-width: 1023px){
      body article .test {
        margin-top: 50px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
