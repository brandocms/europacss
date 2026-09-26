# EuropaCSS

EuropaCSS turns design tokens and directives such as `@space`, `@fontsize` and `@responsive` into responsive CSS. The native compiler uses our Rust parser, JSON5 configuration and Lightning CSS for browser transforms. The executable and Config Studio need no Node, PostCSS or Node bindings.

**The native compiler is an experimental preview.** The root npm package and JavaScript source remain the legacy implementation used for migration comparisons. Installing `@brandocms/europacss` does not install the native CLI. The optional Vite adapter is currently a local, unpublished package.

## Getting started

From this checkout, with stable Rust installed:

```sh
cargo install --locked --path crates/europacss
europa --version
```

With Cargo's bin directory on `PATH`, run the included example:

```sh
mkdir -p build
europa crates/europacss/examples/app.css \
  --config crates/europacss/examples/europa.json5 \
  --source-map -o build/app.css

europa studio --config crates/europacss/examples/europa.json5
```

For a project with `css/app.css` and `europa.json5`:

```sh
mkdir -p public
europa css/app.css --config europa.json5 -o public/app.css --watch
europa css/app.css --config europa.json5 -o public/app.css --minify --source-map
```

The output directory must exist. Always pass `--config` to the CLI; without it, Europa uses built-in defaults. Studio prints a local URL and lets you inspect and edit tokens, preview realistic content, load project fonts and check accessibility measurements. Export JSON5 to keep Studio edits.

## Guides and HTML docs

The VitePress site lives in [`docs/`](docs/guide/getting-started.md). Its guides cover:

- [Getting started](docs/guide/getting-started.md): install and compile a complete starter project.
- [Configuration](docs/guide/configuration.md): JSON5, references, responsive values and extensions.
- [Vite](docs/guide/vite.md): local adapter setup, HMR, targets and source maps.
- [Build and watch](docs/guide/build.md): CLI options, imports, assets and production output.
- [Lint and migration](docs/guide/lint-and-migration.md): compilation checks, versioned analysis and reviewed fixes.
- [Config Studio](docs/guide/studio.md): visual editing, local fonts and accessibility checks.
- [Development](docs/guide/development.md): compiler, docs and adapter build/test commands.
- [Legacy PostCSS setup](docs/guide/legacy-postcss.md): the existing JavaScript workflow.

Build and preview the HTML documentation with optional Node/Yarn tooling:

```sh
cd docs
yarn install --frozen-lockfile
yarn build
yarn preview
```

Use the printed URL under `/europacss/`. This does not publish the docs.

## Migrating an existing site

```sh
europa migrate-config europa.config.cjs -o europa.json5
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --check
```

Use the actual supported legacy version: beta.6, beta.11 or beta.16. Native nesting, declaration order and breakpoint boundaries have deliberate differences. Review findings and compare rendered pages before switching a site. There is no separate `europa lint` command yet; compilation validates current input and `migrate` checks legacy differences.

## Contributing

```sh
cargo build --locked --release -p europacss
cargo fmt --all -- --check
cargo clippy --locked -p europacss --all-targets -- -D warnings
cargo test --locked -p europacss
```

These commands need no Node. Root `yarn build` builds the legacy JavaScript package. See the [native implementation notes](crates/europacss/README.md) for library APIs and supported behavior, and [release notes](RELEASE.md) for native preview packaging.
