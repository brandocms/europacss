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

The native CI workflow checks Linux, macOS and Windows. The native npm release workflow builds seven platform packages, tests clean npm/pnpm consumer installations on Node 22 and 24, and publishes tested tarballs for `native-v*` tags. See `RELEASE.md` in the repository for first-publication setup and the exact platform matrix. Archives and npm binaries include dependency notices; builds are unsigned and not notarized.

Pack the CLI wrapper, adapter and a host binary for installation tests:

```sh
python3 scripts/package-npm.py --shared --archive dist/native/europa-0.1.0-beta.0-aarch64-apple-darwin.tar.gz
node scripts/test-npm.mjs --manager npm
```

Replace the archive path with the one printed by `package-rust.py`. The smoke test starts a read-only loopback registry for these tarballs and installs ordinary dependencies from npm. `--manager pnpm` uses globally installed pnpm 10.32.1; `EUROPA_PNPM_CLI` can point to a local `pnpm.cjs` instead. A source-workspace install deliberately omits platform dependencies; the packer generates the exact dependency map when making release tarballs.

## Optional Vite adapter tests

With Node 22 or 24 and npm available:

```sh
cargo build --locked -p europacss
cd packages
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
