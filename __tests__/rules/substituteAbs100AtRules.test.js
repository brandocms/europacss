import postcss from 'postcss'

const plugin = require('../../src')

function run(input, opts) {
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
      $desktop: 'desktop',
      $mobile: 'mobile/tablet'
    }
  }
}

it('applies abs100 without breakpoint', () => {
  const input = `
    .element {
      @abs100;
    }
  `

  const output = `
    .element {
      position: absolute;
      width: 100%;
      height: 100%;
      top: 0;
      left: 0;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('applies abs100 with important flag', () => {
  const input = `
    .element {
      @abs100!;
    }
  `

  const output = `
    .element {
      position: absolute !important;
      width: 100% !important;
      height: 100% !important;
      top: 0 !important;
      left: 0 !important;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('applies abs100 with specific breakpoint', () => {
  const input = `
    .element {
      @abs100 tablet;
    }
  `

  const output = `
    @media (width >= 740px) and (width <= 1023px) {
      .element {
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('applies abs100 with breakpoint collection', () => {
  const input = `
    .element {
      @abs100 $desktop;
    }
  `

  const output = `
    @media (width >= 1024px) {
      .element {
        position: absolute;
        width: 100%;
        height: 100%;
        top: 0;
        left: 0;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('applies abs100 with advanced breakpoint query', () => {
  const input = `
    .element {
      @abs100 >=tablet;
    }
  `

  const output = `
    @media (width >= 740px) {
      .element {
        width: 100%;
        height: 100%;
        position: absolute;
        top: 0;
        left: 0;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('applies abs100 inside @responsive', () => {
  const input = `
    .element {
      @responsive tablet {
        @abs100;
      }
    }
  `

  const output = `
    @media (width >= 740px) and (width <= 1023px) {
      @media (width >= 740px) and (width <= 1023px) {
        .element {
          position: absolute;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
        }
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('fails when @abs100 has children', () => {
  const input = `
    .element {
      @abs100 {
        color: red;
      }
    }
  `

  expect.assertions(1)
  return run(input, DEFAULT_CFG).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('fails when @abs100 is used at root', () => {
  const input = `
    @abs100;
  `

  expect.assertions(1)
  return run(input, DEFAULT_CFG).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})

it('fails when @abs100 is nested under @responsive and has breakpoint', () => {
  const input = `
    .element {
      @responsive tablet {
        @abs100 desktop;
      }
    }
  `

  expect.assertions(1)
  return run(input, DEFAULT_CFG).catch(e => {
    expect(e).toMatchObject({ name: 'CssSyntaxError' })
  })
})
