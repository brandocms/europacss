# Getting started

EuropaCSS turns design tokens and directives such as `@space` and `@fontsize` into responsive CSS. The native compiler uses Rust, JSON5 configuration and Lightning CSS for browser transforms. Its executable and Config Studio need no Node or PostCSS.

::: info Native preview
These guides describe the experimental native compiler in this checkout. It is not yet a published replacement for the JavaScript npm package. Existing PostCSS projects should start with [migration](./lint-and-migration), or use the [legacy setup](./legacy-postcss).
:::

## Install the native executable

From a checkout containing `Cargo.toml` and `crates/europacss`, with the stable Rust toolchain installed:

```sh
cargo install --locked --path crates/europacss
europa --version
```

Cargo installs `europa` into its bin directory; that directory must be on your `PATH`. To keep the executable inside the checkout instead, run `cargo build --locked --release -p europacss` and use `./target/release/europa` in place of `europa` below. Windows uses `europa.exe`.

If you already have a native preview archive for your OS and CPU, extract it and use its executable. Running the binary does not require Rust. The npm package `@brandocms/europacss` is the legacy PostCSS implementation; installing it does not install this CLI.

## Create a project configuration

Create `europa.json5` in your project. Comments, trailing commas, unquoted identifier keys and single quotes are supported:

```json5
{
  // Values in dpx use this design viewport as their reference.
  dpxViewportSize: 1440,
  theme: {
    breakpoints: { xs: '0', sm: '740px', md: '1024px' },
    breakpointCollections: { $mobile: 'xs', $tablet: 'sm', $desktop: 'md' },
    container: {
      maxWidth: { xs: '100%', sm: '100%', md: '1200px' },
      padding: { xs: '20px', sm: '32px', md: '48px' },
    },
    columns: {
      count: { xs: 2, sm: 4, md: 12 },
      gutters: { xs: '16px', sm: '24px', md: '32px' },
    },
    spacing: {
      sm: { xs: '12px', sm: '16px', md: '20px' },
      md: { xs: '24px', sm: '32px', md: '48px' },
      block: '{spacing.md}',
    },
    typography: {
      base: '16px',
      families: {
        main: ['system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'monospace'],
      },
      sizes: {
        body: { __base__: { 'line-height': 1.5 }, xs: '16px', '*': '18px' },
        heading: {
          __base__: { 'font-weight': 600, 'line-height': 1.1 },
          xs: '32px', sm: '40px', md: '48px',
        },
      },
    },
    colors: { ink: '#263344', paper: '#ffffff', accent: '#6554cf' },
  },
}
```

<a href="../examples/europa.json5" download>Download this configuration</a>. The [configuration guide](./configuration) explains references, defaults, shared type properties and design pixels.

## Write a stylesheet

Create `css/app.css`:

```css
@europa base;

body {
  @font main;
  @fontsize body;
  @color fg ink;
  @color bg paper;
}

.hero {
  @space container;
  @space padding-y block;

  h1 {
    @fontsize heading;
    @space margin-bottom sm;
  }

  @responsive >=sm {
    text-align: center;
  }
}
```

<a href="../examples/app.css" download>Download this stylesheet</a>. The bundled `@europa base` includes normalize/reset styles and initializes `--ec-zoom` to `1`. Place local `@import` statements before the bundle and other rules. If you use your own reset, initialize `:root { --ec-zoom: 1; }` when using sizes that depend on it.

## Build and watch

Run these commands from your project directory:

```sh
mkdir -p public
europa css/app.css --config europa.json5 -o public/app.css --source-map
europa css/app.css --config europa.json5 -o public/app.css --source-map --watch
```

Selectors follow [native CSS nesting and source order](../reference/nesting).

The output directory must exist. Link `public/app.css` from your site using the appropriate public URL. Watch mode recompiles the entry, its local CSS imports and the config. Stop it with Ctrl-C.

**Pass `--config` explicitly.** The CLI does not discover `europa.json5`; omitting the option uses Europa's built-in defaults. The Vite adapter has its own default config path.

## Open Config Studio

```sh
europa studio --config europa.json5
```

Open the printed local URL. Preview typography, spacing, grids and realistic content; click a specimen to edit its authored values. Export JSON5 to keep your changes. Studio does not overwrite your file.

## Choose your workflow

- [Vite](./vite): compile imported CSS with HMR and source maps.
- [Build and watch](./build): production builds, targets, imports and CLI options.
- [Lint and migration](./lint-and-migration): validation, legacy warnings and reviewed fixes.
- [Config Studio](./studio): visual editing, fonts and accessibility checks.
- [Development](./development): build, lint and test Europa itself.
