# Developing EuropaCSS

Run these commands from the repository root on the native compiler branch. Rust builds, tests and lint checks do not need Node.

## Build, format, lint and test

```sh
cargo build --locked --release -p europacss
cargo fmt --all -- --check
cargo clippy --locked -p europacss --all-targets -- -D warnings
cargo test --locked -p europacss
```

Use `cargo fmt --all` to apply Rust formatting. To run one suite or test:

```sh
cargo test --locked -p europacss --test responsive
cargo test --locked -p europacss fractional_breakpoints
```

A regular release build writes `target/release/europa` (`europa.exe` on Windows). Packaging with an explicit Rust target uses `target/<triple>/release/` instead.

Compile the repository example:

```sh
./target/release/europa crates/europacss/examples/app.css \
  --config crates/europacss/examples/europa.json5 \
  --source-map -o target/example.css
```

## Package a native preview

```sh
python3 scripts/package-rust.py
```

Python is packaging tooling only. The script builds for the host, writes an archive and checksum under `dist/native/`, then extracts it and smoke-tests the included example with an empty `PATH`. Archives include the executable, examples, a manifest and dependency/license records.

The native CI workflow defines Linux, macOS and Windows jobs. It uploads preview artifacts; it does not publish the native CLI or Vite adapter. Public distribution still needs a supported-platform policy, completed upstream notices and signing/notarization decisions.

## Optional Vite adapter tests

With Node 22 and npm available:

```sh
cargo build --locked -p europacss
cd packages/vite
npm ci
npm test
```

The suite exercises Vite builds and dependency/HMR behavior. `EUROPA_BINARY` can select another executable. See the [Vite guide](./vite) for application integration.

## Documentation site

The HTML docs use VitePress. With Node and Yarn Classic available:

```sh
cd docs
yarn install --frozen-lockfile
yarn dev
```

Build and preview the generated HTML:

```sh
yarn build
yarn preview
```

Output goes to `docs/.vitepress/dist`. The site's base path is `/europacss/`; use the full preview URL. VitePress checks internal links during the build. The Pages workflow deploys docs on relevant pushes to `master` or an explicit workflow run. A local build does not publish anything.

## Studio editor assets

Ordinary Cargo builds embed the checked-in browser assets. Only changes to the CodeMirror bundle require optional Node tooling:

```sh
cd tools/studio-editor
npm ci
npm run build
```

Commit the generated editor bundle and license/dependency notices with changes to its source. The surrounding Studio UI files live in `crates/europacss/studio/` and are embedded directly.

## Legacy JavaScript implementation

The root `package.json`, `src/`, `lib/` and Jest suites still describe the legacy PostCSS implementation used for migration comparisons:

```sh
yarn install --frozen-lockfile
yarn test
yarn build
```

Root `yarn build` transpiles legacy JavaScript. It does not build the Rust compiler or the HTML docs. No root `lint` script exists; Rust linting uses Clippy above.
