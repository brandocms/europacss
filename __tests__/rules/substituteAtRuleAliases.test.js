const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('aliases @column-offset', () => {
  const input = `
    article {
      @column-offset 1/12;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        margin-left: calc(8.333333% - 22.916667px)
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        margin-left: calc(8.333333% - 32.083333px)
      }
    }
    @media (min-width: 1024px) and (max-width: 1899px){
      article{
        margin-left: calc(8.333333% - 45.833333px)
      }
    }
    @media (min-width: 1900px){
      article{
        margin-left: calc(8.333333% - 55px)
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('aliases @column-offset negative value', () => {
  const input = `
    article {
      @column-offset -1/12;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        margin-left: calc(-8.333333% - 27.083333px)
      }
    }
    @media (min-width: 740px) and (max-width: 1023px){
      article{
        margin-left: calc(-8.333333% - 37.916667px)
      }
    }
    @media (min-width: 1024px) and (max-width: 1899px){
      article{
        margin-left: calc(-8.333333% - 54.166667px)
      }
    }
    @media (min-width: 1900px){
      article{
        margin-left: calc(-8.333333% - 65px)
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('aliases @column-offset for single bp', () => {
  const input = `
    article {
      @column-offset 1/12 xs;
    }
  `

  const output = `
    @media (min-width: 0) and (max-width: 739px){
      article{
        margin-left: calc(8.333333% - 22.916667px)
      }
    }

  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
