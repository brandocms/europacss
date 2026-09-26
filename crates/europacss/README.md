# EuropaCSS in Rust — first compiler milestone

This is an experimental standalone Rust library and `europa` executable. Building, testing, and running it require no Node, npm, PostCSS, or Node bindings. Europa source is parsed by our own Rust structural parser, expanded into standard CSS in source order, and passed directly to the Lightning CSS Rust crate. The published JavaScript implementation remains in the repository as the migration reference.

```sh
cargo build --locked --release -p europacss
cargo test --locked -p europacss

./target/release/europa crates/europacss/examples/app.css \
  --config crates/europacss/examples/europa.json5 \
  --targets 'defaults' --source-map -o /tmp/europa-example.css
```

The CLI also accepts stdin (`europa -`), writes CSS to stdout when `-o` is omitted, and supports `--minify`. Browser queries run in Rust using Lightning's Browserslist support. The Rust Lightning dependency is pinned to `1.0.0-alpha.72`; it comes from the exact same source commit (`c6a0c3c`) as [GitHub/npm v1.33.0](https://github.com/parcel-bundler/lightningcss/blob/v1.33.0/Cargo.toml). Rust and npm use separate version numbers. Source maps compose through both compiler stages and include original source content. Diagnostics identify the source file, line, column, and a stable error code. Maps currently identify originating rules/directives, not every character of generated declarations.


The terminal output uses color automatically on interactive terminals. Errors and warnings show the originating file, a numbered source excerpt, and a caret, including imported files. Build summaries show elapsed time, CSS size, file count, and enabled output options. All diagnostics and summaries go to stderr, so stdout remains CSS only. `--quiet` hides successful build/conversion summaries; warnings and errors remain visible. Use `--color auto|always|never` to override detection. Auto mode respects `NO_COLOR` and `TERM=dumb`; `--help` follows stdout's terminal status separately.

```text
  europa  ✓ compiled in 12.4 ms
          css/app.css → public/app.css
          8 files · 84.2 KiB · minified · source map
```

The numbers above illustrate the display, not benchmark results.

## Implemented

- Local `@import` resolution with dependency tracking, repeated imports in source order, media/supports/layer qualifiers, cycle and expansion limits, and per-file source maps and diagnostics. Relative `url()` and `image-set()` assets are rebased for the output directory. Leading external imports stay browser-loaded.
- Own parser for Europa block/statement structure, strings, comments, escapes, functions, balanced component values, and custom properties containing blocks. CSS selector/property grammar is validated by Lightning.
- `@color`, `@color!`, `@display`, `@order`, `@font`, `@if`, and root `%placeholder` definitions expanded with `@extend %name`. Extensions support forward references, nested rules, and cycle detection.
- `@iterate` over config objects and arrays, with scoped `$key` / `$value` substitution in declarations, selectors, strings, and directive arguments. Comments, escapes, and longer names such as `$keyboard` are preserved. Nested iterators bind their own variables; all expansions stay at the directive's source position and have a bounded node budget.
- `@unpack` responsive property maps, plus `containerPadding` / `gridGutter` custom-property aliases using the shared sizing evaluator.
- `@abs100` / `@abs100!` with optional breakpoint queries and `@embed-responsive width/height` using the existing pseudo-element layout.
- `@responsive` / `@mq` with nested intersections, named breakpoints, `$collections`, slash lists, comparisons, and pixel arrow ranges. Breakpoints are ordered numerically; current integer-pixel boundary conventions are retained.
- `@space` / `@space!` and `@column-offset`: literal CSS sizes, named/wildcard tokens, negative values, gutter multipliers, column fractions and gutter modifiers, token multiplication/division, `calc(var[...])`, design pixels, capped viewport sizes, fluid `between()`, vertical rhythm, container padding, dynamic `*` padding with minimums, breakout, transforms, and `negate()` margin adjustments.
- `@fontsize` and `@font`: named/wildcard sizes, literal and hierarchical slash keys, modifiers and line-height suffixes, property objects, shared `__base__` properties, design pixels, viewport zoom/maximums, fluid sizing, and native CSS calculations.
- `@grid` and `@column` reuse the spacing evaluator. Column output retains the existing 0.002vw max-width adjustment. Deprecated `@row` reports replacement instructions.
- `theme()` token lookup, scalar arrays, lazy fallbacks, and recursive value references; `ease()` with all 40 legacy easing names and aliases. Value functions run in declarations and directive/conditional parameters, while strings, comments, and URL payloads remain literal. Unknown keys, invalid value types, cycles, and excessive expansion produce diagnostics. Declaration values cannot introduce extra declarations or rules.
- `@europa base` and `@europa arrows`, with bundled styles and normalize.css embedded in the executable. Their Europa directives use the same config and transforms as authored styles.
- Local compaction of adjacent media blocks with identical conditions or bodies. Exact query clauses are retained, including fractional viewport gaps; no rules move past siblings or across scopes.
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

A read-only integration run now compiles the current eight-file Site A entry with a temporary JSON5 config. This is a compilation check, not visual or behavioral parity, and does not replace the published package. Still to port: watch/build integration and release packaging. Full case-by-case parity and further output-size optimization of the legacy spacing/typography suites remain ongoing. Nested responsive blocks retain their outer conditions; responsive values are selected by the innermost query. Breakpoint-dependent sizes in custom arrow ranges are emitted as intersecting media conditions. Placeholders are currently root definitions only. `@unpack` property bags contain CSS declaration values; Europa sizing expressions in those bags are not evaluated.

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

Use `compile_file(&request, output_path)` for local import resolution. Set `request.filename` to the entry path and leave `request.source` empty. The optional output path determines the base for asset URLs; omitting it uses the entry directory. `Output.dependencies` contains canonical source paths in first-visit order. The CLI uses this API automatically for file inputs. In-memory input and stdin cannot load local imports.

Imports require exact relative file paths, including extensions. Package resolution, globs, and stylesheet-local `@namespace` bundling are not implemented. Remote/root-relative imports are retained without fetching; a remote import that would land after bundled style rules or inside a conditional/layer wrapper fails explicitly instead of being moved. Imported files must be UTF-8. Import conditions wrap the imported layer, following the [CSS import rules](https://drafts.csswg.org/css-cascade-5/#at-import). The bundler rebases assets but does not copy them. Symlinks resolve to canonical file locations.

`compile_frontend` exposes the intermediate standard CSS before media compaction for transform development. `compile` also performs native nesting lowering, target transforms, optional compact printing, and source-map composition using [Lightning's Rust API](https://docs.rs/lightningcss/1.0.0-alpha.72/lightningcss/stylesheet/struct.StyleSheet.html).
