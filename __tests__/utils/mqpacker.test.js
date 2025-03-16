import postcss from 'postcss'
import mqpacker from '../../src/lib/plugins/postcss/mqpacker'

const run = (input, options = {}) => {
  return postcss([mqpacker(options)]).process(input, { from: undefined })
}

it('sorts max-width-only queries before min-width queries', () => {
  const input = `
    @media (width >= 740px) {
      .test {
        color: blue;
      }
    }
    @media (width <= 739px) {
      .test {
        color: red;
      }
    }
  `

  const expected = `
    @media (width <= 739px) {
      .test {
        color: red;
      }
    }
    @media (width >= 740px) {
      .test {
        color: blue;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(expected)
    expect(result.warnings().length).toBe(0)
  })
})

it('sorts multiple mixed media queries in mobile-first order', () => {
  const input = `
    @media (width >= 1024px) {
      .desktop {
        display: block;
      }
    }
    @media (width <= 739px) {
      .mobile {
        display: block;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      .tablet {
        display: block;
      }
    }
  `

  const expected = `
    @media (width <= 739px) {
      .mobile {
        display: block;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      .tablet {
        display: block;
      }
    }
    @media (width >= 1024px) {
      .desktop {
        display: block;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(expected)
    expect(result.warnings().length).toBe(0)
  })
})

it('properly handles the legacy syntax', () => {
  const input = `
    @media (min-width: 1024px) {
      .desktop {
        display: block;
      }
    }
    @media (max-width: 739px) {
      .mobile {
        display: block;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px) {
      .tablet {
        display: block;
      }
    }
  `

  const expected = `
    @media (max-width: 739px) {
      .mobile {
        display: block;
      }
    }
    @media (min-width: 740px) and (max-width: 1023px) {
      .tablet {
        display: block;
      }
    }
    @media (min-width: 1024px) {
      .desktop {
        display: block;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(expected)
    expect(result.warnings().length).toBe(0)
  })
})

it('merges identical media queries', () => {
  const input = `
    @media (width <= 739px) {
      .test1 {
        color: red;
      }
    }
    @media (width <= 739px) {
      .test2 {
        color: pink;
      }
    }
  `

  const expected = `
    @media (width <= 739px) {
      .test1 {
        color: red;
      }
      .test2 {
        color: pink;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(expected)
    expect(result.warnings().length).toBe(0)
  })
})

it('can disable sorting if needed', () => {
  const input = `
    @media (width >= 1024px) {
      .desktop {
        display: block;
      }
    }
    @media (width <= 739px) {
      .mobile {
        display: block;
      }
    }
  `

  return run(input, { sort: false }).then(result => {
    // Should maintain the original order
    expect(result.css).toMatch(/@media \(width >= 1024px\)[\s\S]*@media \(width <= 739px\)/);
    expect(result.warnings().length).toBe(0)
  })
})

it('sorts queries with same min-width by max-width in descending order', () => {
  const input = `
    @media (width >= 1024px) and (width <= 1398px) {
      .desktop-small {
        display: block;
      }
    }
    @media (width >= 1024px) {
      .desktop-all {
        display: block;
      }
    }
    @media (width >= 1024px) and (width <= 1899px) {
      .desktop-medium {
        display: block;
      }
    }
  `

  const expected = `
    @media (width >= 1024px) {
      .desktop-all {
        display: block;
      }
    }
    @media (width >= 1024px) and (width <= 1398px) {
      .desktop-small {
        display: block;
      }
    }
    @media (width >= 1024px) and (width <= 1899px) {
      .desktop-medium {
        display: block;
      }
    }
  `

  return run(input).then(result => {
    expect(result.css).toMatchCSS(expected)
    expect(result.warnings().length).toBe(0)
  })
})