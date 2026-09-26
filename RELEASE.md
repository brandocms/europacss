# Releases and preview builds

The repository contains two implementations: the experimental native compiler and the legacy JavaScript/PostCSS package. Their versions and build commands are separate.

## Native preview

From the repository root:

```sh
cargo fmt --all -- --check
cargo clippy --locked -p europacss --all-targets -- -D warnings
cargo test --locked -p europacss
python3 scripts/package-rust.py
```

Packaging builds the host executable, writes an archive and checksum under `dist/native/`, then extracts it and compiles the bundled example with an empty `PATH`. The archive includes the binary, examples, manifest and available dependency/license notices. Python is only needed for packaging.

The [native workflow](.github/workflows/rust.yml) defines Linux, macOS and Windows checks and uploads preview artifacts. It does not create a public release or publish an npm package. The native crate and Vite adapter are not published; versions live in `crates/europacss/Cargo.toml` and `packages/vite/package.json`.

Before public native distribution, complete the upstream license notices, supported-platform policy and signing/notarization decisions described in the [binary notes](crates/europacss/BINARY-README.md). Do not use the legacy npm release procedure for the native binary.

## HTML documentation

```sh
cd docs
yarn install --frozen-lockfile
yarn build
```

VitePress writes `docs/.vitepress/dist`, served under `/europacss/`. The [Pages workflow](.github/workflows/docs.yml) deploys relevant pushes to `master` or explicit workflow runs. Building locally does not deploy.

## Legacy JavaScript package

The root `package.json` identifies the PostCSS package. Its existing release process updates `CHANGELOG.md` and the root version, runs `yarn test` and `yarn build`, then commits the release. Historical tags use the version without a `v` prefix.

The [npm workflow](.github/workflows/npmpublish.yml) publishes the root package when a tag is pushed. Creating/pushing a release tag is a publication action; it is separate from local commits and native preview builds. Do not also run a duplicate manual publish for a release handled by that workflow.
