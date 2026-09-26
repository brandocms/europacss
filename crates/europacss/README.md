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

## Native preview archives

`python3 scripts/package-rust.py` builds a release executable for the host, creates
an archive plus SHA-256 checksum under `dist/native/`, extracts it, and compiles the
included example with an empty `PATH`. Python is packaging tooling only. The archive
contains the binary, examples, manifest, dependency inventory, and available license
notices. `--target <triple>` can package another installed Rust target; it still needs
a suitable linker and a matching machine for the runtime smoke test.

The [Rust CI workflow](../../.github/workflows/rust.yml) runs formatting, Clippy,
tests, packaging, and the runtime smoke test on Linux, macOS, and Windows runners.
It uploads preview artifacts only and does not publish npm packages or GitHub releases.
The local macOS ARM64 preview has been verified; the other runners have not been run
in this worktree. Public releases still need completed upstream notices, a supported
platform policy, and signing/notarization decisions. See [binary notes](BINARY-README.md).

## Watch mode

```sh
europa css/app.css --config europa.json5 --source-map -o public/app.css --watch
```

Watch mode compiles immediately, then checks input contents every 250 ms. It tracks the current import graph, the JSON5 config, and symlink targets; editor file replacements are detected even when timestamps or sizes stay unchanged. Newly added imports are picked up on rebuild and removed imports stop triggering builds. Compile/config errors retain the previous CSS and source map. Failed builds retry once per second so creating a missing import or fixing the first build recovers automatically; identical repeated errors are printed only once. Stop with Ctrl-C.

This first implementation uses content polling rather than operating-system notifications. Its idle I/O scales with the source/config size. Output files do not trigger rebuilds; asset contents, external URLs, and unrelated files are not watched. `--watch` requires a file input and `-o` output. It never concatenates repeated builds on stdout.

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
- Local compaction of adjacent media blocks with identical conditions or bodies. Repeated width queries can also combine across media blocks proven to have disjoint width ranges. Exact query clauses and fractional viewport gaps remain; ordinary rules, overlapping or unknown conditions, and enclosing scopes are barriers. The proof search is bounded.
- Native nesting specificity and declaration order. Conditional output stays inside its enclosing `@supports` / `@layer`. No global media sorting or duplicate-selector combining.
- JSON5 configuration with comments, existing default data, theme-section replacement, `theme.extend`, and `{path.to.token}` references. Full references preserve object/array types; embedded references require strings or numbers. Unknown references and cycles fail.
- A native config conversion command: `europa migrate-config europa.config.cjs -o europa.json5`. It accepts static CommonJS/ESM object exports or exported JSON data, validates references, and refuses to overwrite an existing output. Static JS conversion retains comments and quotes supported numeric keys without executing code.
- Versioned migration checks for nesting specificity, nested pseudo-elements, suffix syntax, and local declaration-order conflicts. `europa migrate` reads the entry and local imports with the actual JSON5 config. Supported suffix fixes preserve conditions and declaration order; appearance choices remain explicit.

## Configuration

Use `--config europa.json5` explicitly. Without it, the compiler uses the checked-in default configuration. The library's `load_config` accepts `.json5` and strict `.json`; `resolve_config` accepts a data object. Call one of them before constructing a library `Request`. Pass `--watch` to monitor this config and imported stylesheets. Config discovery remains explicit.

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

For a static legacy config, run `europa migrate-config europa.config.cjs -o europa.json5`. It recognizes `module.exports = { ... }` and `export default { ... }`, keeps comments/strings intact, and quotes safe decimal integer keys. JSON5 input is validated and retained; exported strict JSON is formatted as JSON5. The command refuses duplicate keys, non-finite values, prototype-setting properties, ambiguous numeric keys, or object-key order that JavaScript would rearrange. Arrange array-index keys in ascending order before other keys when asked, then rerun. Original files are never edited and existing output files are never overwritten.

JavaScript callbacks, variable references, spreads, computed keys, imports, and function calls require manual conversion to static data or `{token.references}`. They produce an error before output is created; no code is executed. A general exporter for dynamic configs remains future work. Existing exported JSON can still be converted with `europa migrate-config resolved.json -o europa.json5`; comments absent from that JSON cannot be recovered.

A future [config studio](../../research/config-studio.md) could provide visual typography, grid, and spacing editors with responsive previews driven by the same compiler. This is a proposal, not an implemented CLI feature.

## Migration review

```sh
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --check
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --check --json > migration.json
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --fix
```

The source version is required. The currently modeled profile is exactly `1.0.0-beta.16`; other versions fail rather than inheriting guessed semantics. The default is read-only `--check`. Text diagnostics go to stderr; `--json` writes a structured report to stdout. Exit status 1 means findings remain or a listed analysis could not finish.

Specificity checks expand legacy selector alternatives and compare them with native `:is()` parent semantics using Lightning's selector parser, including `:where()`, `:is()`, `:not()`, `:has()`, and `:nth-child(... of ...)`. Conditions containing only declarations do not trigger selector-list warnings. Iterators and placeholders are expanded with the real config. Limits or unsupported selector contexts produce an incomplete-analysis finding rather than a clean result.

Matching checks also flag pseudo-element parents and multiple top-level `&` selectors separated by combinators. For example, `.a, .b { & + & {} }` used to expand to `.a + .a, .b + .b`; native CSS can additionally match `.a + .b` and `.b + .a`, despite equal specificity. General matching equivalence inside selector functions is not modeled.

Local order checks compare overlapping properties, including shorthand longhands and importance. For example, `@fontsize base; line-height: normal` reports the shared base value appended by the old compiler and the later authored value in the new compiler. Earlier media output conflicting with a later fallback is also reported. Keeping corrected authored order needs no source edit. The diagnostic explains how to preserve an old fallback/override order deliberately; `--fix` never makes that appearance choice.

To record intentional semantic changes, save a `--json` report and set `"accepted": true` on each finding you have reviewed. Rerun with `--accept migration.json`; accepted findings remain visible in JSON, and status 0 means no unresolved findings remain in the listed checks. Saving a report alone accepts nothing. Syntax errors and incomplete analysis cannot be accepted. Review decisions are bound to the analyzer revision and a BLAKE3 snapshot of every source path/content, resolved configuration, and target query; any changed input requires a fresh review. Reports currently refer to canonical paths in the same checkout. Apply `--fix` before generating the review report; it cannot be combined with `--accept`.

Resolved sizing checks follow actual token expansion and breakpoint selection. They flag the zero-width breakpoint correction in spacing `between()`, additive scalar calculations in `vertical-rhythm()` that are now multiplied as a whole, and object font modifiers that now retain their other properties. These findings identify the authored directive and affected breakpoint; unused config tokens do not warn. Formula changes require review and can be explicitly accepted; `--fix` does not change them.

`--fix` currently flattens a suffix subtree only when it has one plain class/ID parent, suffix-only child selectors, and CSS declarations or supported conditions without Europa directives. It retains comments, declaration order, and enclosing scopes. It declines complex/generated cases and bounds proposed edits. Rewrites use source snapshots, reject stale/overlapping edits, preserve file permissions, replace individual files atomically, and rerun analysis afterward. A multi-file invocation is not a filesystem transaction; earlier successful edits remain if a later file write fails.

A clean report covers only the checks listed in its JSON. It does not prove unchanged computed styles. Cross-selector cascade, arbitrary condition overlap, global duplicate-selector/media sorting, logical/physical property interactions, other sizing differences, and backend/browser-target differences still need review. `@scope` analysis is currently reported as incomplete. Use rendered-page comparisons before upgrading a site.

## Remaining work before migrating a site

A read-only integration run now compiles the current eight-file Site A entry with a temporary JSON5 config. This is a compilation check, not visual or behavioral parity, and does not replace the published package. Native preview packaging and a three-OS CI workflow are included; only the local macOS ARM64 archive has been executed so far. Full case-by-case parity and further output-size optimization of the legacy spacing/typography suites remain ongoing. Nested responsive blocks retain their outer conditions; responsive values are selected by the innermost query. Breakpoint-dependent sizes in custom arrow ranges are emitted as intersecting media conditions. Placeholders are currently root definitions only. `@unpack` property bags contain CSS declaration values; Europa sizing expressions in those bags are not evaluated.

Migration coverage beyond the checks above, dynamic JavaScript config export, and rendered-page comparisons remain work in progress. `&__suffix` and `@nest` still fail compilation until migrated. Recognized unported directives and sizing expressions fail explicitly. Unknown CSS at-rules are passed to Lightning, which can issue warnings. This structural parser is not yet a complete CSS Syntax conformance implementation.

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
