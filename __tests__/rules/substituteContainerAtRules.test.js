const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

const VW_CFG = {
  setMaxForVw: true,
  theme: {
    breakpoints: {
      xs: '0',
      sm: '740px',
      md: '1024px'
    },
    container: {
      maxWidth: {
        xs: '100%',
        sm: '100%',
        md: '1024px'
      },
      padding: {
        xs: '4vw',
        sm: '4vw',
        md: '4vw'
      }
    },
    spacing: {
      md: {
        xs: '5vw',
        sm: '10vw',
        md: '15vw'
      }
    },
    columns: {
      gutters: {
        xs: '2vw',
        sm: '2vw',
        md: '2vw'
      }
    }
  }
}

it('fails on root', () => {
  const input = `
    @space container;
  `

  expect.assertions(1)
  return run(input).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('parses @space container with no other decls', () => {
  const input = `
    article {
      @space container;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        padding-left: 15px;
        padding-right: 15px;
        max-width: 740px;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        padding-left: 35px;
        padding-right: 35px;
        max-width: 1024px;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px){
      article{
        padding-left: 50px;
        padding-right: 50px;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px){
      article{
        padding-left: 100px;
        padding-right: 100px;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
    @media (min-width: 1900px){
      article{
        padding-left: 100px;
        padding-right: 100px;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses container with other decls', () => {
  const input = `
    article {
      @space container;
      background-color: red;
      padding-bottom: 50px;
    }
  `

  const output = `
    article {
      background-color: red;
      padding-bottom: 50px;
    }
    @media (min-width: 0) and (max-width: 739px){
      article {
        padding-left: 15px;
        padding-right: 15px;
        max-width: 740px;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article {
        padding-left: 35px;
        padding-right: 35px;
        max-width: 1024px;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
      }
    }
    @media (min-width: 1024px) and (max-width: 1398px){
      article {
        padding-left: 50px;
        padding-right: 50px;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
      }
    }
    @media (min-width: 1399px) and (max-width: 1899px){
      article {
        padding-left: 100px;
        padding-right: 100px;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
      }
    }
    @media (min-width: 1900px){
      article {
        padding-left: 100px;
        padding-right: 100px;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space container with vws and setMax', () => {
  const input = `
    article {
      @space container;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        padding-left: 4vw;
        padding-right: 4vw;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        padding-left: 4vw;
        padding-right: 4vw;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
    @media (min-width: 1024px){
      article{
        padding-left: 40.96px;
        padding-right: 40.96px;
        max-width: 1024px;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
  `

  return run(input, VW_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space container with vws without setMax', () => {
  const input = `
    article {
      @space container;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        padding-left: 4vw;
        padding-right: 4vw;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        padding-left: 4vw;
        padding-right: 4vw;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
    @media (min-width: 1024px){
      article{
        padding-left: 4vw;
        padding-right: 4vw;
        max-width: 1024px;
        margin-left: auto;
        margin-right: auto;
        width: 100%
      }
    }
  `

  return run(input, { ...VW_CFG, setMaxForVw: false }).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @space container for specific breakpoints', () => {
  const input = `
    article {
      @space container xs/sm/xl;
      background-color: red;
      padding-bottom: 50px;
    }
  `

  const output = `
    article {
      background-color: red;
      padding-bottom: 50px;
    }
    @media (min-width: 0) and (max-width: 739px){
      article {
        padding-left: 15px;
        padding-right: 15px;
        max-width: 740px;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article {
        padding-left: 35px;
        padding-right: 35px;
        max-width: 1024px;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
      }
    }
    @media (min-width: 1900px){
      article {
        padding-left: 100px;
        padding-right: 100px;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        width: 100%;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('runs correctly inside @responsive', () => {
  const input = `
    article {
      @responsive xs {
        @space container;
      }

      background-color: red;
      padding-bottom: 50px;
    }
  `

  const output = `
    article {
      background-color: red;
      padding-bottom: 50px;
    }
    @media (width >= 0) and (width <= 739px) {
      @media (width >= 0) and (width <= 739px) {
        article {
          width: 100%;
          max-width: 740px;
          margin-left: auto;
          margin-right: auto;
          padding-left: 15px;
          padding-right: 15px;
        }
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('parses @container for specific breakpoints', () => {
  const input = `
    article {
      @space container xs;
      @space container sm;
    }
  `

  const output = `
  @media (min-width: 0) and (max-width: 739px){
    article{
      padding-left: 15px;
      padding-right: 15px;
      max-width: 740px;
      margin-left: auto;
      margin-right: auto;
      width: 100%
    }
  }
  @media (min-width: 740px) and (max-width: 1023px){
    article{
      padding-left: 35px;
      padding-right: 35px;
      max-width: 1024px;
      margin-left: auto;
      margin-right: auto;
      width: 100%
    }
  }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
