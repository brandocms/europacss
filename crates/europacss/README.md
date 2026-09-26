# EuropaCSS in Rust — first compiler milestone

This is an experimental standalone Rust library and `europa` executable. Building, testing, and running it require no Node, npm, PostCSS, or Node bindings. Europa source is parsed by our own Rust structural parser, expanded into standard CSS in source order, and passed directly to the Lightning CSS Rust crate. The published JavaScript implementation remains in the repository as the migration reference.

```sh
cargo build --locked --release -p europacss
cargo test --locked -p europacss

./target/release/europa crates/europacss/examples/app.css \
  --config crates/europacss/examples/europa.toml \
  --targets 'defaults' --source-map -o /tmp/europa-example.css
```

The CLI also accepts stdin (`europa -`), writes CSS to stdout when `-o` is omitted, and supports `--minify`. Browser queries run in Rust using Lightning's Browserslist support. The Rust Lightning dependency is pinned to `1.0.0-alpha.72`; its versioning differs from the npm package. Source maps compose through both compiler stages and include original source content. Diagnostics identify the source file, line, column, and a stable error code. Maps currently identify originating rules/directives, not every character of generated declarations.

## Implemented

- Own parser for Europa block/statement structure, strings, comments, escapes, functions, balanced component values, and custom properties containing blocks. CSS selector/property grammar is validated by Lightning.
- `@color`, `@color!`, `@display`, `@order`, `@font`, `@if`, and root `%placeholder` definitions expanded with `@extend %name`. Extensions support forward references, nested rules, and cycle detection.
- `@responsive` with named breakpoints, `$collections`, slash lists, comparisons, and pixel arrow ranges. Breakpoints are ordered numerically; current integer-pixel boundary conventions are retained.
- Basic `@space` / `@space!`, `@column-offset`, and `@fontsize`: literal CSS sizes, named scalar/breakpoint tokens, x/y margin/padding shortcuts, typography property objects, and `__base__` properties. Native CSS calculations can pass through; Europa sizing expressions are not yet ported.
- Native nesting specificity and declaration order. Conditional output stays inside its enclosing `@supports` / `@layer`. No global media sorting or duplicate-selector combining.
- TOML configuration with comments, existing default data, theme-section replacement, `theme.extend`, and `{path.to.token}` references. Full references preserve object/array types; embedded references require strings or numbers. Unknown references and cycles fail.
- A data conversion command: `europa migrate-config resolved.json -o europa.toml`. It validates references and refuses to overwrite an existing output. JSON nulls and other values TOML cannot represent produce errors.

## Configuration

Use `--config europa.toml` explicitly. Without it, the compiler uses the checked-in default configuration. The library's `load_config` accepts TOML and JSON; `resolve_config` accepts a data object. Call one of them before constructing a library `Request`. Config files are not watched or discovered automatically yet.

```toml
[theme.colors]
ink = "#123456"
text = "{colors.ink}" # Comments and references both work.

[theme.typography.families]
sans = ["Inter", "sans-serif"]

[theme.typography.sizes."heading/4xl".__base__]
font-family = "{typography.families.sans}"
```

TOML comments and quoted keys are standard features, not Europa extensions. [TOML specification](https://toml.io/en/v1.0.0).

For richer typography, one table per named style keeps related values together. Dotted keys avoid a second long header for `__base__`, and short inline tables keep each breakpoint on one line:

```toml
[theme.typography.sizes."heading/4xl"]
__base__.font-family = "{typography.families.sans}"
__base__.font-weight = 600
__base__.line-height = 1.1
__base__.letter-spacing = "-0.025em"

mobile = { font-size = "32px", line-height = 1.15 }
tablet = { font-size = "48px" }
desktop = { font-size = "clamp(48px, 4vw, 72px)", letter-spacing = "-0.04em" }
```

Use it with `.hero-title { @fontsize heading/4xl; }`. Shared properties are expanded first, followed by breakpoint overrides, all at the directive's source position. The full [example config](examples/europa.toml) defines the referenced font family and all three breakpoints. A regression test compiles this config and compares the result with explicit CSS. `clamp()` is native CSS; Europa `dpx` and wildcard size expansion are still pending, although TOML can represent both as quoted values/keys.

For a breakpoint with many declarations or individual comments, it can instead have its own table, for example `[theme.typography.sizes."heading/4xl".desktop]`. Do not also define `desktop` as an inline table: TOML does not allow redefining or extending an inline table elsewhere. The tradeoff is that these full table headers get verbose for deeply nested typography.

The JSON-to-TOML command is only the data-conversion part of migration. An exporter for existing JavaScript configs is still needed: it must evaluate both theme callbacks and typography `__base__` callbacks using the old installation, then report any behavior that a static snapshot would lose. That one-time legacy export would require the old JavaScript environment; the new compiler does not execute JavaScript. Source comments from a JavaScript file cannot survive an export containing only its evaluated data.

## Remaining work before migrating a site

This does not yet compile all of Site A or replace the published package. Still to port: imports and dependency tracking; `dpx`/fluid/column/container sizing and calculations; full typography query syntax; `@iterate`, `@unpack`, `@europa`, grid/row/column helpers, embeds and other utilities; `theme()` / `ease()` CSS functions; watch/build integration; and release packaging. Nested `@responsive` blocks and named size tokens inside custom arrow ranges are not supported yet. Placeholders are currently root definitions only.

The migration linter, version-aware specificity/order warnings, suffix autofixes, JavaScript config exporter, and rendered-page comparisons remain separate work. `&__suffix` and `@nest` currently fail with actionable diagnostics. Recognized unported directives and sizing expressions fail explicitly. Unknown CSS at-rules are passed to Lightning, which can issue warnings. This structural parser is not yet a complete CSS Syntax conformance implementation.

The Rust tests cover parsing/error paths, directive expansion, configuration, final backend semantics, composed maps, and CLI behavior with an empty `PATH`. They are the start of porting the existing test coverage, not a claim that the old 337-test suite passes against the new compiler. No speedup is claimed until representative transforms and import handling are implemented and benchmarked.

## Library

```rust
use europacss::{compile, load_config, Request};

let request = Request {
    source: ".card { @color fg text; }".into(),
    filename: "app.css".into(),
    config: load_config(std::path::Path::new("europa.toml"))?,
    source_map: true,
    browsers: vec!["defaults".into()],
    ..Request::default()
};
let output = compile(&request)?;
```

`compile_frontend` exposes the intermediate standard CSS for transform development. `compile` also performs native nesting lowering, target transforms, optional compact printing, and source-map composition using [Lightning's Rust API](https://docs.rs/lightningcss/1.0.0-alpha.72/lightningcss/stylesheet/struct.StyleSheet.html).
