# EuropaCSS in Rust — first compiler milestone

This is an experimental standalone Rust library and `europa` executable. Building, testing, and running it require no Node, npm, PostCSS, or Node bindings. Europa source is parsed by our own Rust structural parser, expanded into standard CSS in source order, and passed directly to the Lightning CSS Rust crate. The published JavaScript implementation remains in the repository as the migration reference.

```sh
cargo build --locked --release -p europacss
cargo test --locked -p europacss

./target/release/europa crates/europacss/examples/app.css \
  --config crates/europacss/examples/europa.json5 \
  --targets 'defaults' --source-map -o /tmp/europa-example.css
```

The CLI also accepts stdin (`europa -`), writes CSS to stdout when `-o` is omitted, and supports `--minify`. Browser queries run in Rust using Lightning's Browserslist support. The Rust Lightning dependency is pinned to `1.0.0-alpha.72`; its versioning differs from the npm package. Source maps compose through both compiler stages and include original source content. Diagnostics identify the source file, line, column, and a stable error code. Maps currently identify originating rules/directives, not every character of generated declarations.

## Implemented

- Own parser for Europa block/statement structure, strings, comments, escapes, functions, balanced component values, and custom properties containing blocks. CSS selector/property grammar is validated by Lightning.
- `@color`, `@color!`, `@display`, `@order`, `@font`, `@if`, and root `%placeholder` definitions expanded with `@extend %name`. Extensions support forward references, nested rules, and cycle detection.
- `@iterate` over config objects and arrays, with scoped `$key` / `$value` substitution in declarations, selectors, strings, and directive arguments. Comments, escapes, and longer names such as `$keyboard` are preserved. Nested iterators bind their own variables; all expansions stay at the directive's source position and have a bounded node budget.
- `@unpack` responsive property maps, plus `containerPadding` / `gridGutter` custom-property aliases using the shared sizing evaluator.
- `@abs100` / `@abs100!` with optional breakpoint queries and `@embed-responsive width/height` using the existing pseudo-element layout.
- `@responsive` with named breakpoints, `$collections`, slash lists, comparisons, and pixel arrow ranges. Breakpoints are ordered numerically; current integer-pixel boundary conventions are retained.
- `@space` / `@space!` and `@column-offset`: literal CSS sizes, named/wildcard tokens, negative values, gutter multipliers, column fractions and gutter modifiers, token multiplication/division, `calc(var[...])`, design pixels, capped viewport sizes, fluid `between()`, vertical rhythm, container padding, dynamic `*` padding with minimums, breakout, transforms, and `negate()` margin adjustments.
- `@fontsize` and `@font`: named/wildcard sizes, literal and hierarchical slash keys, modifiers and line-height suffixes, property objects, shared `__base__` properties, design pixels, viewport zoom/maximums, fluid sizing, and native CSS calculations.
- `@grid` and `@column` reuse the spacing evaluator. Column output retains the existing 0.002vw max-width adjustment. Deprecated `@row` reports replacement instructions.
- `theme()` token lookup, scalar arrays, lazy fallbacks, and recursive value references; `ease()` with all 40 legacy easing names and aliases. Value functions run in declarations and directive/conditional parameters, while strings, comments, and URL payloads remain literal. Unknown keys, invalid value types, cycles, and excessive expansion produce diagnostics.
- `@europa base` and `@europa arrows`, with bundled styles and normalize.css embedded in the executable. Their Europa directives use the same config and transforms as authored styles.
- Native nesting specificity and declaration order. Conditional output stays inside its enclosing `@supports` / `@layer`. No global media sorting or duplicate-selector combining.
- JSON5 configuration with comments, existing default data, theme-section replacement, `theme.extend`, and `{path.to.token}` references. Full references preserve object/array types; embedded references require strings or numbers. Unknown references and cycles fail.
- A data conversion command: `europa migrate-config resolved.json -o europa.json5`. It validates references and refuses to overwrite an existing output. Arrays, objects, nulls, token references, and key order survive conversion.

## Configuration

Use `--config europa.json5` explicitly. Without it, the compiler uses the checked-in default configuration. The library's `load_config` accepts `.json5` and strict `.json`; `resolve_config` accepts a data object. Call one of them before constructing a library `Request`. Config files are not watched or discovered automatically yet.

JSON5 supports comments, single-quoted strings, unquoted identifier keys, and trailing commas. It is data only: no `module.exports`, imports, callbacks, or JavaScript evaluation. Parsing runs entirely in Rust. [JSON5 specification](https://spec.json5.org/).

Advanced typography keeps shared properties and breakpoint overrides together:

```json5
{
  theme: {
    breakpoints: { mobile: '0', tablet: '740px', desktop: '1024px' },
    colors: {
      ink: '#163442',
      text: '{colors.ink}', // References replace simple theme callbacks.
    },
    typography: {
      families: { sans: ['Inter', 'sans-serif'] },
      sizes: {
        'heading/4xl': {
          __base__: {
            'font-family': '{typography.families.sans}',
            'font-weight': 600,
            'line-height': 1.1,
            'letter-spacing': '-0.025em',
          },
          mobile: { 'font-size': '32px', 'line-height': 1.15 },
          tablet: { 'font-size': '48px' },
          desktop: {
            'font-size': 'clamp(48px, 4vw, 72px)',
            'letter-spacing': '-0.04em',
          },
        },
      },
    },
  },
}
```

Use it with `.hero-title { @fontsize heading/4xl; }`. Shared properties are expanded first, followed by breakpoint overrides, all at the directive's source position. The full [example config](examples/europa.json5) also includes spacing and body text. A regression test compares its compiled typography with explicit CSS. Native `clamp()`, Europa `dpx`, and `'*'` fallback breakpoint entries are supported.

Duplicate object keys and non-finite numbers (`NaN`, `Infinity`) are rejected as config errors; nulls are preserved. The loader does not rewrite source files, so comments remain untouched. The library's `json_to_json5` and CLI conversion command emit formatted JSON5 from exported JSON data.

The JSON-to-JSON5 command is only the data-conversion part of migration. An exporter for existing JavaScript configs is still needed: it must evaluate both theme callbacks and typography `__base__` callbacks using the old installation, then report any behavior that a static snapshot would lose. That one-time legacy export would require the old JavaScript environment; the new compiler does not execute JavaScript. Source comments from a JavaScript file cannot survive an export containing only its evaluated data.

A future [config studio](../../research/config-studio.md) could provide visual typography, grid, and spacing editors with responsive previews driven by the same compiler. This is a proposal, not an implemented CLI feature.

## Remaining work before migrating a site

This does not yet compile all of Site A or replace the published package. Still to port: imports and dependency tracking; watch/build integration; and release packaging. Full case-by-case parity and output-size optimization of the legacy spacing/typography suites remain ongoing. Nested `@responsive` blocks are not supported yet. Breakpoint-dependent sizes in custom arrow ranges are emitted as intersecting media conditions. Placeholders are currently root definitions only. `@unpack` property bags contain CSS declaration values; Europa sizing expressions in those bags are not evaluated.

The migration linter, version-aware specificity/order warnings, suffix autofixes, JavaScript config exporter, and rendered-page comparisons remain separate work. `&__suffix` and `@nest` currently fail with actionable diagnostics. Recognized unported directives and sizing expressions fail explicitly. Unknown CSS at-rules are passed to Lightning, which can issue warnings. This structural parser is not yet a complete CSS Syntax conformance implementation.

The Rust tests cover parsing/error paths, directive expansion, configuration, final backend semantics, composed maps, and CLI behavior with an empty `PATH`. The [rule porting tracker](tests/README.md) records which legacy cases have been translated and which semantics intentionally differ. This is not a claim that the old 337-test suite passes against the new compiler. No speedup is claimed until representative transforms and import handling are implemented and benchmarked.

## Library

```rust
use europacss::{compile, load_config, Request};

let request = Request {
    source: ".card { @color fg text; }".into(),
    filename: "app.css".into(),
    config: load_config(std::path::Path::new("europa.json5"))?,
    source_map: true,
    browsers: vec!["defaults".into()],
    ..Request::default()
};
let output = compile(&request)?;
```

`compile_frontend` exposes the intermediate standard CSS for transform development. `compile` also performs native nesting lowering, target transforms, optional compact printing, and source-map composition using [Lightning's Rust API](https://docs.rs/lightningcss/1.0.0-alpha.72/lightningcss/stylesheet/struct.StyleSheet.html).
