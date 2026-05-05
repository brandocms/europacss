# Configuration

EuropaCSS is driven entirely by configuration. Your `europa.config.js` defines breakpoints, spacing, typography, colors, and container sizing. All at-rules reference these values.

## Config Structure

```js
module.exports = {
  // Global options
  setMaxForVw: true,
  dpxViewportSize: 1440,
  dpxViewportSizes: { /* ... */ },

  theme: {
    breakpoints: { /* ... */ },
    breakpointCollections: { /* ... */ },
    container: { /* ... */ },
    spacing: { /* ... */ },
    typography: { /* ... */ },
    colors: { /* ... */ },
    columns: { /* ... */ }
  }
}
```

## Breakpoints

Breakpoints define your responsive ranges. Each key maps to a minimum width (except the first, which starts at 0):

```js
breakpoints: {
  xs: '0',
  sm: '740px',
  md: '1024px',
  lg: '1399px',
  xl: '1900px'
}
```

The order matters — breakpoints are processed sequentially. Each breakpoint's range extends from its value to just before the next breakpoint's value.

## Breakpoint Collections

Group breakpoints under a `$`-prefixed name for convenient shorthand:

```js
breakpointCollections: {
  $mobile: 'xs',
  $tablet: 'sm',
  $desktop: 'md/lg/xl'
}
```

Use in CSS:

```css
@responsive $mobile { ... }
@space padding-y md $desktop;
```

## Container

Defines the responsive container's max-width and horizontal padding per breakpoint:

```js
container: {
  maxWidth: {
    xs: '100%',
    sm: '100%',
    md: '100%',
    lg: '1920px',
    xl: '1920px'
  },
  padding: {
    xs: '15px',
    sm: '35px',
    md: '50px',
    lg: '80px',
    xl: '120px'
  }
}
```

Used by `@space container;` which outputs padding-left/right, max-width, margin auto, and width: 100% for each breakpoint.

## Spacing

A named spacing scale, responsive per breakpoint:

```js
spacing: {
  xs: { xs: '10px', sm: '15px', md: '15px', lg: '20px', xl: '20px' },
  sm: { xs: '20px', sm: '25px', md: '30px', lg: '35px', xl: '40px' },
  md: { xs: '35px', sm: '45px', md: '55px', lg: '65px', xl: '75px' },
  lg: { xs: '50px', sm: '70px', md: '100px', lg: '120px', xl: '140px' },
  xl: { xs: '70px', sm: '100px', md: '140px', lg: '170px', xl: '200px' },
  block: { xs: '40px', sm: '60px', md: '80px', lg: '100px', xl: '120px' }
}
```

Referenced in CSS via `@space margin-y xl;`, `@space padding block;`, etc.

## Typography

### Base

```js
typography: {
  base: '18px'
}
```

### Font Families

Flat or hierarchical:

```js
families: {
  // Flat
  main: ['Inter', 'sans-serif'],
  mono: ['JetBrains Mono', 'monospace'],

  // Hierarchical (slash notation)
  'body/regular': ['Inter', 'sans-serif'],
  'body/bold': ['Inter-Bold', 'sans-serif'],
  'header/display': ['Playfair Display', 'serif'],

  // Or nested objects
  body: {
    regular: ['Inter', 'sans-serif'],
    bold: ['Inter-Bold', 'sans-serif']
  }
}
```

Used via `@font main;` or `@font header/display;`

### Font Sizes

Responsive per breakpoint:

```js
sizes: {
  xs: { xs: '12px', sm: '12px', md: '14px', lg: '14px', xl: '14px' },
  base: { xs: '16px', sm: '17px', md: '18px', lg: '18px', xl: '18px' },
  xl: { xs: '28px', sm: '36px', md: '44px', lg: '50px', xl: '56px' },

  // Hierarchical
  'header/large': { xs: '32px', sm: '40px', md: '48px', lg: '56px', xl: '64px' },
  'body/small': { xs: '12px', sm: '13px', md: '14px', lg: '14px', xl: '14px' }
}
```

### Sizes with Extra Properties (`__base__`)

Use `__base__` to attach properties that apply across all breakpoints:

```js
sizes: {
  'body-large': {
    __base__: {
      'line-height': '135%',
      'letter-spacing': '-0.02em',
      'font-family': theme => theme.typography.families.main
    },
    xs: { 'font-size': '20px' },
    sm: { 'font-size': '25px' },
    md: { 'font-size': '30px' },
    lg: { 'font-size': '32px' },
    xl: { 'font-size': '34px' }
  }
}
```

The `__base__` properties are output outside of any media query. Breakpoint values go inside their respective media queries.

### Multi-Property Font Sizes

Each breakpoint value can be an object with multiple CSS properties:

```js
sizes: {
  h1: {
    xs: { 'font-size': '32px', 'line-height': '120%', 'letter-spacing': '-0.02em' },
    sm: { 'font-size': '40px', 'line-height': '115%', 'letter-spacing': '-0.02em' },
    md: { 'font-size': '56px', 'line-height': '110%', 'letter-spacing': '-0.03em' }
  }
}
```

## Colors

Flat or nested:

```js
colors: {
  black: '#000',
  white: '#fff',
  transparent: 'transparent',
  primary: '#3ecf8e',
  headings: {
    h1: '#1a1a1a',
    h2: '#333'
  },
  button: {
    primary: '#3ecf8e',
    hover: '#2da36e'
  }
}
```

Used via `@color fg black;`, `@color bg headings.h1;`, etc.

## Columns

Grid column count and gutters:

```js
columns: {
  count: { xs: 2, sm: 4, md: 6, lg: 12, xl: 12 },
  gutters: { xs: '20px', sm: '25px', md: '30px', lg: '40px', xl: '50px' }
}
```

## Global Options

### `setMaxForVw`

When `true`, if your largest breakpoint uses `vw` units, EuropaCSS converts them to fixed pixel values based on the container max-width. This prevents elements from scaling beyond the container.

```js
setMaxForVw: true
```

### `dpxViewportSize`

Reference viewport width for design pixel (`dpx`) unit conversion. Default: `1440`.

```js
dpxViewportSize: 1440
```

### `dpxViewportSizes`

Per-breakpoint reference widths for `dpx` conversion:

```js
dpxViewportSizes: {
  xs: 375,
  sm: 768,
  md: 1024,
  lg: 1440,
  xl: 1920
}
```

## Token References

Reference other config values using `{path.notation}`:

```js
colors: {
  primary: '#3ecf8e',
  button: {
    default: '{colors.primary}'        // Resolves to '#3ecf8e'
  },
  border: {
    accent: '1px solid {colors.primary}' // String interpolation
  }
}
```

Full references (standalone `{path}`) preserve the original type. Partial references (embedded in a string) do string interpolation.

## Extending Config

Use `extend` to merge additional values into the theme without replacing existing ones:

```js
module.exports = {
  theme: {
    spacing: { /* base spacing */ },
    extend: {
      spacing: {
        '2xl': { xs: '100px', sm: '150px', md: '200px', lg: '250px', xl: '300px' }
      }
    }
  }
}
```
