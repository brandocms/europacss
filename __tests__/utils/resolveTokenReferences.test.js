import resolveTokenReferences from '../../src/util/resolveTokenReferences'

describe('resolveTokenReferences', () => {
  it('passes through plain values unchanged', () => {
    const theme = {
      colors: { red: '#f00', blue: '#00f' },
      spacing: { sm: '10px' },
      count: 42,
      flag: true
    }
    const result = resolveTokenReferences(theme)
    expect(result).toEqual(theme)
  })

  it('resolves a simple string reference', () => {
    const theme = {
      colors: { red: '#f00' },
      button: { primary: '{colors.red}' }
    }
    const result = resolveTokenReferences(theme)
    expect(result.button.primary).toBe('#f00')
  })

  it('resolves a deep path reference', () => {
    const theme = {
      typography: {
        sizes: {
          base: '16px'
        }
      },
      components: {
        card: { fontSize: '{typography.sizes.base}' }
      }
    }
    const result = resolveTokenReferences(theme)
    expect(result.components.card.fontSize).toBe('16px')
  })

  it('resolves an object reference (preserves type)', () => {
    const theme = {
      spacing: {
        xs: { xs: '10px', sm: '15px', md: '15px', lg: '15px', xl: '15px' }
      },
      block: '{spacing.xs}'
    }
    const result = resolveTokenReferences(theme)
    expect(result.block).toEqual({ xs: '10px', sm: '15px', md: '15px', lg: '15px', xl: '15px' })
  })

  it('resolves an array reference (preserves type)', () => {
    const theme = {
      typography: {
        families: {
          sans: ['Helvetica', 'Arial', 'sans-serif']
        }
      },
      font: { body: '{typography.families.sans}' }
    }
    const result = resolveTokenReferences(theme)
    expect(result.font.body).toEqual(['Helvetica', 'Arial', 'sans-serif'])
  })

  it('resolves partial string interpolation', () => {
    const theme = {
      colors: { red: '#f00' },
      border: { default: '1px solid {colors.red}' }
    }
    const result = resolveTokenReferences(theme)
    expect(result.border.default).toBe('1px solid #f00')
  })

  it('resolves multiple interpolations in one string', () => {
    const theme = {
      colors: { red: '#f00', blue: '#00f' },
      gradient: '{colors.red} to {colors.blue}'
    }
    const result = resolveTokenReferences(theme)
    expect(result.gradient).toBe('#f00 to #00f')
  })

  it('resolves chained references (A -> B -> C)', () => {
    const theme = {
      primitives: { red500: '#f00' },
      semantic: { danger: '{primitives.red500}' },
      button: { error: '{semantic.danger}' }
    }
    const result = resolveTokenReferences(theme)
    expect(result.button.error).toBe('#f00')
    expect(result.semantic.danger).toBe('#f00')
  })

  it('throws on circular reference', () => {
    const theme = {
      a: '{b}',
      b: '{a}'
    }
    expect(() => resolveTokenReferences(theme)).toThrow(/Circular reference/)
  })

  it('throws on self-referencing token', () => {
    const theme = {
      a: '{a}'
    }
    expect(() => resolveTokenReferences(theme)).toThrow(/Circular reference/)
  })

  it('throws on missing reference', () => {
    const theme = {
      button: { primary: '{colors.nonexistent}' }
    }
    expect(() => resolveTokenReferences(theme)).toThrow(/does not exist/)
  })

  it('throws when interpolating a non-string/number value', () => {
    const theme = {
      spacing: {
        xs: { xs: '10px', sm: '15px' }
      },
      border: 'something {spacing.xs} else'
    }
    expect(() => resolveTokenReferences(theme)).toThrow(/Cannot interpolate/)
  })

  it('resolves number values in partial interpolation', () => {
    const theme = {
      grid: { columns: 12 },
      layout: { colInfo: '{grid.columns} columns' }
    }
    const result = resolveTokenReferences(theme)
    expect(result.layout.colInfo).toBe('12 columns')
  })

  it('resolves references inside arrays', () => {
    const theme = {
      colors: { red: '#f00', blue: '#00f' },
      palette: ['{colors.red}', '{colors.blue}']
    }
    const result = resolveTokenReferences(theme)
    expect(result.palette).toEqual(['#f00', '#00f'])
  })

  it('does not modify the original theme object', () => {
    const theme = {
      colors: { red: '#f00' },
      button: { primary: '{colors.red}' }
    }
    resolveTokenReferences(theme)
    expect(theme.button.primary).toBe('{colors.red}')
  })
})
