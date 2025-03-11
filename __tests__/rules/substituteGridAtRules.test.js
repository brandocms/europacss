const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

it('sets column gap and display grid', () => {
  const input = `
    article {
      @grid;
      color: blue;
    }
  `

  const output = `
    article {
      grid-template-columns: repeat(12, 1fr);
      display: grid;
    }
    @media (width >= 0) and (width <= 739px) {
      article {
        grid-column-gap: 25px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article {
        grid-column-gap: 35px;
      }
    }
    @media (width >= 1024px) and (width <= 1398px) {
      article {
        grid-column-gap: 50px;
      }
    }
    @media (width >= 1399px) and (width <= 1899px) {
      article {
        grid-column-gap: 50px;
      }
    }
    @media (width >= 1900px) {
      article {
        grid-column-gap: 60px;
      }
    }
    article {
      color: #00f;
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
