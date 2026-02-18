const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

const CFG_WITH_REFS = {
  theme: {
    breakpoints: {
      xs: '0',
      sm: '740px',
      md: '1024px',
      lg: '1399px',
      xl: '1900px'
    },

    breakpointCollections: {
      $mobile: 'xs/sm'
    },

    colors: {
      red: '#f00',
      blue: '#00f',
      // Semantic tokens referencing primitives
      primary: '{colors.red}',
      secondary: '{colors.blue}'
    },

    border: {
      default: '1px solid {colors.red}'
    },

    container: {
      maxWidth: {
        xs: '100%',
        sm: '100%',
        md: '100%',
        lg: '100%',
        xl: '100%'
      },
      padding: {
        xs: '15px',
        sm: '35px',
        md: '50px',
        lg: '100px',
        xl: '100px'
      }
    },

    columns: {
      count: {},
      gutters: {
        xs: '3vw',
        sm: '3vw',
        md: '2.5vw',
        lg: '2.5vw',
        xl: '48px'
      }
    }
  }
}

it('resolves color token references in @color rule', () => {
  const input = `
    article {
      @color fg primary;
      @color bg secondary;
    }
  `

  const output = `
    article {
      color: #f00;
      background-color: #00f;
    }
  `

  return run(input, CFG_WITH_REFS).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('resolves interpolated token references in theme values', () => {
  // The border.default value uses partial interpolation:
  // '1px solid {colors.red}' -> '1px solid #f00'
  // We verify by checking the resolved config indirectly through usage
  const resolveConfig = require('../../src/util/resolveConfig').default
  const resolved = resolveConfig([CFG_WITH_REFS])
  expect(resolved.theme.border.default).toBe('1px solid #f00')
})

it('resolves chained token references', () => {
  const cfg = {
    theme: {
      ...CFG_WITH_REFS.theme,
      colors: {
        ...CFG_WITH_REFS.theme.colors,
        danger: '{colors.primary}'
      }
    }
  }

  const resolveConfig = require('../../src/util/resolveConfig').default
  const resolved = resolveConfig([cfg])
  // primary -> {colors.red} -> '#f00', danger -> {colors.primary} -> '#f00'
  expect(resolved.theme.colors.danger).toBe('#f00')
})
