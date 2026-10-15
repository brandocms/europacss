# Configuration

EuropaCSS is driven entirely by configuration. Your `europa.json5` defines breakpoints, spacing, typography, colors, and container sizing. All at-rules reference these values.

Pass `--config europa.json5` explicitly to the CLI. Without it, the compiler uses its built-in defaults. The Vite adapter defaults to `europa.json5` relative to Vite's root.

JSON5 permits comments, trailing commas, unquoted identifier keys and single quotes. It is data: functions, imports and JavaScript expressions are not evaluated. Duplicate keys, non-finite numbers and invalid references are rejected. Strict `.json` files are also supported.

Except for complete `{ … }` examples, the snippets below are fragments to place under `theme` or the named section. Start with the [complete getting-started config](./getting-started#create-a-project-configuration).

## Nesting semantics

The top-level `nesting` option accepts `'native'` (default) or `'expanded'`.
Expanded mode emits explicit selector lists with per-branch specificity and
matching. It can be inherited and overridden like other config values. See
[expanded selectors](../reference/nesting#expanded-selector-mode) for examples,
limits, and differences from native CSS nesting.

## Responsive ordering

The top-level `responsiveOrder` option accepts `'all-last'` (default) or
`'generated-last'`. The default places both authored and directive-generated
media after common rules in each scope. With `'generated-last'`, authored
`@media` stays at its source position; only Europa-generated media moves last.
This includes `@responsive` and its `@mq` alias.

```json5
// Shared preset; applications extending it inherit both options.
{
  nesting: 'expanded',
  responsiveOrder: 'generated-last',
}
```

An application can override either option independently. Layers and conditional
boundaries remain unchanged. See [cascade and layers](../reference/cascade)
for ordering examples and the aggregate-import pattern for 0.x migrations.

## Migration assumptions

`migration.mediaPacking` accepts `'assume'` (default) or `'none'`. Set `'none'`
only when the old build did not pack or sort its media queries. This skips
packing-dependent migration warnings and inherits through `extends`. It does
not affect compiled CSS or replace the `responsiveOrder` setting. See
[declaring the old build's media packing](./lint-and-migration#declare-whether-the-old-build-packed-media)
for report coverage and review behavior.

## Inherit a shared config

Use a top-level `extends` path to inherit another JSON5 or JSON file:

```json5
// europa.json5
{
  extends: './presets/brando.json5',
  theme: {
    colors: { accent: '#c43b57' },
    typography: {
      families: { main: ['Inter', 'sans-serif'] },
      sizes: { heading: { lg: '48px' } },
    },
  },
}
```

The child keeps the parent's other colors, families, sizes, and the other
breakpoints of `heading`. Its `main` family array replaces the parent's array.
Objects merge recursively; arrays, scalars and `null` replace the inherited value.
`null` is a value, not a deletion marker; the resulting config must still be valid
where the compiler uses it.

Each file can extend one parent, which can extend another. Paths are relative to
the file declaring them, not the working directory. Symlinks use the real file's
directory for its own parent path. Absolute paths also work. Supply an exact
`.json5` or `.json` filename: there is no package-name, Vite-alias, URL, or
JavaScript resolution. For a package that ships `europa.json5`, the path can be:

```json5
{ extends: './node_modules/@brandocms/brandojs/europa.json5' }
```

Resolution happens in this order:

1. Read and recursively merge the raw parent configs, then the child.
2. Apply Europa's built-in defaults and [theme-section replacement](#defaults-and-extensions).
3. Apply `theme.extend` with its existing one-level merge semantics.
4. Resolve token references against the final theme.

A parent reference such as `'{colors.accent}'` therefore sees the child's accent.
Inheritance does not turn the built-in defaults into a recursive merge. Also,
an inherited `theme.extend.colors.accent` still applies after ordinary
`theme.colors.accent`; override that value under `theme.extend` in the child.
Configs without `extends` retain their existing replacement/extension behavior.

Cycles, invalid parent files and missing files produce errors that identify the
inheritance chain. Chains are limited to 64 files and 8 MiB total source data.
CLI watch mode follows every parent and recovers when missing files appear.
[Vite](./vite#imports-reloads-and-errors) also tracks inherited files, including
installed presets in `node_modules`. Migration reviews use the resolved config,
so inherited changes that alter it invalidate saved decisions.

The Rust library's `load_config(path)` resolves inheritance. Use
`load_config_tracked(path, &mut watched)` to also receive canonical dependencies,
content snapshots and attempted paths on errors. The data-only
`resolve_config(value)` rejects `extends` because it has no config file location.

## Config Structure

```json5
{
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

Breakpoints define your responsive ranges. Each key maps to a minimum width:

```json5
breakpoints: {
  xs: '0',
  sm: '740px',
  md: '1024px',
  lg: '1399px',
  xl: '1900px'
}
```

Breakpoints are sorted by numeric width, regardless of key order. Widths must be distinct, non-negative pixel values; include a zero breakpoint to cover the smallest screens. Each named range includes its starting width and excludes the next: `sm` above means `width >= 740px` and `width < 1024px`. Fractional widths stay covered.

## Breakpoint Collections

Group breakpoints under a `$`-prefixed name for convenient shorthand:

```json5
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

```json5
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

```json5
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

`typography.paddingDivider` is deprecated. Its consumer, `@column-typography`,
was removed in 0.2.0. Existing values and explicit token references remain
supported for compatibility; new configs should omit it. Use `columns.gutters`
to configure the gutter shared by `@column` and numeric spacing such as
`@space gap 1;`. See the [migration notes](./lint-and-migration#converted-typography-settings).

### Base

```json5
typography: {
  base: '18px'
}
```

`typography.base` sets the root font size used by the bundled base stylesheet and Studio. It is separate from a token named `typography.sizes.base`, which is applied with `@fontsize base`. Set both deliberately when using `rem`.

### Font Families

Flat or hierarchical:

```json5
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

Used via `@font main;` or `@font header/display;`. If you replace the typography section and use `@europa base`, include `base` and the `main` and `mono` families that the bundle reads.

### Font Sizes

Responsive per breakpoint:

```json5
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

```json5
sizes: {
  'body-large': {
    __base__: {
      'line-height': '135%',
      'letter-spacing': '-0.02em',
      'font-family': '{typography.families.main}'
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

```json5
sizes: {
  h1: {
    xs: { 'font-size': '32px', 'line-height': '120%', 'letter-spacing': '-0.02em' },
    sm: { 'font-size': '40px', 'line-height': '115%', 'letter-spacing': '-0.02em' },
    md: { 'font-size': '56px', 'line-height': '110%', 'letter-spacing': '-0.03em' }
  }
}
```

### Fallback breakpoint values

For spacing and type tokens, `'*'` supplies a value where no explicit breakpoint entry is selected:

```json5
sizes: {
  body: { xs: '16px', sm: '17px', '*': '18dpx' },
}
```

This keeps fixed small-screen text and fluid sizing for the remaining configured breakpoints. `__base__` properties apply outside media queries, then breakpoint properties can override them. A later common declaration can override generated common properties; responsive rules follow them at matching widths. See [cascade and layers](../reference/cascade) for application overrides.

## Colors

Flat or nested:

```json5
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

Column configuration, including responsive gutters:

```json5
columns: {
  count: { xs: 2, sm: 4, md: 6, lg: 12, xl: 12 },
  gutters: { xs: '20px', sm: '25px', md: '30px', lg: '40px', xl: '50px' }
}
```

The base bundle uses `columns.count` for its grid-overlay helpers. If you replace the `columns` section and use `@europa base`, include both `count` and `gutters`.

`@column` uses the fraction written in CSS and these gutters. `@grid` currently emits a 12-column template and the configured **column gap**; it does not read `columns.count` to choose a track count. Set `grid-template-columns` explicitly for another layout. See [@grid](../reference/grid).

## Global Options

### `setMaxForVw`

When `true`, if your largest breakpoint uses `vw` units, EuropaCSS converts them to fixed pixel values based on the container max-width. This prevents elements from scaling beyond the container.

```json5
setMaxForVw: true
```

### `dpxViewportSize`

Reference viewport width for design pixel (`dpx`) unit conversion. Default: `1440`.

```json5
dpxViewportSize: 1440
```

### `dpxViewportSizes`

Per-breakpoint reference widths for `dpx` conversion (collection names are also supported):

```json5
dpxViewportSizes: {
  xs: 375,
  sm: 768,
  md: 1024,
  lg: 1440,
  xl: 1920
}
```

A direct breakpoint mapping takes precedence over a matching collection, then `dpxViewportSize`, then the 1440px default. Viewport-based text can use `--ec-zoom`; the base bundle initializes it to `1`, while runtime compensation is supplied by your application (for example Jupiter). See [Studio](./studio#accessibility-settings) for the explicit zoom-model settings.

## Token References

Reference other config values using `{path.notation}`:

```json5
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

## Defaults and extensions

Omitted theme sections retain their defaults. Providing `theme.spacing` **replaces that section**, including its default token names. The same applies to `typography`, `container` and other theme sections. If you replace the breakpoint names, update every responsive section you use to match them.

`theme.extend` merges one level into the selected theme section. It adds or replaces direct keys; it does not recursively merge every nested object. For example, `extend.spacing.md` replaces the whole `md` token, and `extend.typography.sizes` replaces the entire sizes map. References are resolved after replacement and extension.

Use an extension to keep the rest of a section:

```json5
{
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
