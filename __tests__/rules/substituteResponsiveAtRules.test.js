const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('parses @responsive for single breakpoint', () => {
  const input = `
    body article .test {
      font-size: 18px;
      color: red;

      @responsive xs {
        color: yellow;
        font-size: 15px;
      }
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
      color: red
    }

    @media (min-width: 0) and (max-width: 739px) {
      body article .test {
        color: yellow;
        font-size: 15px
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @responsive for single breakpoint eq or down', () => {
  const input = `
    body article .test {
      font-size: 18px;
      color: red;

      @responsive <=sm {
        color: yellow;
        font-size: 15px;
      }
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
      color: red
    }

    @media (min-width: 0) and (max-width: 1023px) {
      body article .test {
        color: yellow;
        font-size: 15px
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @responsive for multiple breakpoints', () => {
  const input = `
    body article .test {
      font-size: 18px;
      color: red;

      @responsive xs/sm/xl {
        color: yellow;
        font-size: 15px;
      }
    }
  `

  const output = `
    body article .test {
      font-size: 18px;
      color: red
    }

    @media (min-width: 0) and (max-width: 739px), (min-width: 740px) and (max-width: 1023px), (min-width: 1900px) {
      body article .test {
        color: yellow;
        font-size: 15px
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses multiple @responsive within same rule', () => {
  const input = `
    article {
      width: 90%;
      background-color: black;

      @responsive xs/sm {
        width: 100%;
      }

      @responsive >sm {
        width: 80%;
      }

      @responsive >=md {
        display: flex;
        flex-direction: row;
      }

      @responsive xl {
        background-color: yellow;
      }
    }
  `

  const output = `
    article {
      width: 90%;
      background-color: black
    }

    @media (min-width: 0) and (max-width: 739px), (min-width: 740px) and (max-width: 1023px) {
      article {
        width: 100%
      }
    }

    @media (min-width: 1024px) {
      article {
        width: 80%
      }
    }

    @media (min-width: 1024px) {
      article {
        display: flex;
        flex-direction: row
      }
    }

    @media (min-width: 1900px) {
      article {
        background-color: yellow
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('can run from root', () => {
  const input = `
    @responsive xs {
      .alert-yellow {
        color: yellow;
      }

      .alert-red {
        color: red;
      }
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px) {
      .alert-yellow {
        color: yellow;
      }
      .alert-red {
        color: red;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('can run multiple from root', () => {
  const input = `
    @responsive xs {
      .alert-yellow {
        color: yellow;
      }

      .alert-red {
        color: red;
      }
    }

    @responsive sm {
      .alert-yellow {
        display: none;
      }

      .alert-red {
        display: none;
      }
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px) {
      .alert-yellow {
        color: yellow;
      }
      .alert-red {
        color: red;
      }
    }

    @media (min-width: 740px) and (max-width: 1023px) {
      .alert-yellow {
        display: none;
      }
      .alert-red {
        display: none;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('fails without children', () => {
  const input = `
    body article .test {
      font-size: 18px;
      color: red;

      @responsive;
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

      @responsive {
        font-size: 55px;
      }
    }
  `
  expect.assertions(1)
  return run(input).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('parses advanced nesting', () => {
  const input = `
    header[data-nav] {
      @space container;
      @unpack theme.header.padding.large;

      nav {
        color: pink;
        figure {
          &.brand {
            z-index: 5;

            @responsive <=sm {
              align-items: flex-start;
            }

            svg {
              @unpack theme.typography.sections.navigation;
            }
          }
        }
      }
    }
  `

  const output = `
    header[data-nav] nav {
      color: pink;
    }
    header[data-nav] nav figure.brand {
      z-index: 5;
    }
    @media (width >= 0) and (width <= 739px) {
      header[data-nav] {
        width: 100%;
        max-width: 740px;
        margin-left: auto;
        margin-right: auto;
        padding: 15px;
      }
      header[data-nav] nav figure.brand svg {
        letter-spacing: 0.12rem;
        font-size: 17px;
        line-height: 17px;
      }
    }
    @media (width >= 0) and (width <= 1023px) {
      header[data-nav] nav figure.brand {
        align-items: flex-start;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      header[data-nav] {
        width: 100%;
        max-width: 1024px;
        margin-left: auto;
        margin-right: auto;
        padding: 40px 35px;
      }
      header[data-nav] nav figure.brand svg {
        letter-spacing: 0.12rem;
        font-size: 17px;
        line-height: 17px;
      }
    }
    @media (width >= 1024px) and (width <= 1398px) {
      header[data-nav] {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding: 40px 50px;
      }
      header[data-nav] nav figure.brand svg {
        letter-spacing: 0.12rem;
        font-size: 12px;
        line-height: 12px;
      }
    }
    @media (width >= 1399px) and (width <= 1899px) {
      header[data-nav] {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding: 70px 100px;
      }
      header[data-nav] nav figure.brand svg {
        letter-spacing: 0.12rem;
        font-size: 12px;
        line-height: 12px;
      }
    }
    @media (width >= 1900px) {
      header[data-nav] {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding: 80px 100px;
      }
      header[data-nav] nav figure.brand svg {
        letter-spacing: 2px;
        font-size: 15px;
        line-height: 15px;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses multiple space tags inside nesting', () => {
  const input = `
    .v-module {
      &[data-v="body+center"] {
        @space padding-left 1 >=lg;
        @space margin-left 3/12 >=lg;
      }
    }
  `

  const output = `
    @media (width >= 1399px) and (width <= 1899px) {
      .v-module[data-v=\"body+center\"] {
        margin-left: calc(25% - 37.5px);
        padding-left: 50px;
      }
    }
    @media (width >= 1900px) {
      .v-module[data-v=\"body+center\"] {
        margin-left: calc(25% - 45px);
        padding-left: 60px;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses multiple breakpoints slashed', () => {
  const DEFAULT_CFG = {
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
      @responsive ipad_landscape/desktop_md/desktop_lg/desktop_xl {
        font-size: 16px;
        color: red;
      }
    }
  `

  const output = `
    @media (width >= 1024px) and (width <= 1199px),
      (width >= 1200px) and (width <= 1559px),
      (width >= 1560px) and (width <= 1919px),
      (width >= 1920px) {
      article {
        color: red;
        font-size: 16px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
