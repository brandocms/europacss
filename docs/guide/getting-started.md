# Getting Started

## Installation

```bash
yarn add @brandocms/europacss
```

## PostCSS Setup

Add EuropaCSS to your PostCSS configuration:

```js
// postcss.config.js
module.exports = {
  plugins: [
    require('@brandocms/europacss')()
  ]
}
```

EuropaCSS will automatically look for `europa.config.js` or `europa.config.cjs` in your project root.

You can also specify a config path or pass the config directly:

```js
// Specify config path
require('@brandocms/europacss')({ config: './config/europa.config.js' })

// Pass config object directly
require('@brandocms/europacss')({ config: { theme: { /* ... */ } } })
```

## PostCSS Preset Env

EuropaCSS includes PostCSS Preset Env integration. Configure it via the `presetEnv` option:

```js
require('@brandocms/europacss')({
  presetEnv: {
    browsers: ['> 1%', 'last 2 versions'],
    features: { /* ... */ },
    preserve: false
  }
})
```

Set `presetEnv: { disable: true }` to disable it entirely.

## Create Your Config

Create `europa.config.js` in your project root:

```js
module.exports = {
  theme: {
    breakpoints: {
      xs: '0',
      sm: '740px',
      md: '1024px',
      lg: '1399px',
      xl: '1900px'
    },

    container: {
      maxWidth: {
        xs: '100%',
        sm: '100%',
        md: '100%',
        lg: '100%',
        xl: '1920px'
      },
      padding: {
        xs: '15px',
        sm: '35px',
        md: '50px',
        lg: '80px',
        xl: '120px'
      }
    },

    spacing: {
      xs: { xs: '10px', sm: '15px', md: '15px', lg: '20px', xl: '20px' },
      sm: { xs: '20px', sm: '25px', md: '30px', lg: '35px', xl: '40px' },
      md: { xs: '35px', sm: '45px', md: '55px', lg: '65px', xl: '75px' },
      lg: { xs: '50px', sm: '70px', md: '100px', lg: '120px', xl: '140px' },
      xl: { xs: '70px', sm: '100px', md: '140px', lg: '170px', xl: '200px' }
    },

    typography: {
      base: '18px',
      families: {
        main: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace']
      },
      sizes: {
        xs: { xs: '12px', sm: '12px', md: '14px', lg: '14px', xl: '14px' },
        sm: { xs: '14px', sm: '15px', md: '16px', lg: '16px', xl: '16px' },
        base: { xs: '16px', sm: '17px', md: '18px', lg: '18px', xl: '18px' },
        lg: { xs: '20px', sm: '24px', md: '28px', lg: '30px', xl: '32px' },
        xl: { xs: '28px', sm: '36px', md: '44px', lg: '50px', xl: '56px' }
      }
    },

    colors: {
      black: '#000',
      white: '#fff'
    }
  }
}
```

## Write Your First CSS

```css
.container {
  @space container;
}

.hero {
  @space padding-y xl;
}

.hero h1 {
  @fontsize xl;
}
```

This compiles to responsive CSS with media queries for each breakpoint, using the values from your config.

## Next Steps

- [Configuration](/guide/configuration) — Full config reference
- [@responsive](/reference/responsive) — Media query at-rule
- [@space](/reference/space) — Spacing at-rule
- [@fontsize](/reference/fontsize) — Typography at-rule
