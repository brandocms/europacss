# EuropaCSS project guidelines

## Native compiler (active development)

The Rust compiler is in `crates/europacss`. Its CLI and Studio use JSON5 data and need no Node runtime or native Node bindings. From the repository root:

- Build: `cargo build --locked --release -p europacss`
- Format check: `cargo fmt --all -- --check`
- Format: `cargo fmt --all`
- Lint: `cargo clippy --locked -p europacss --all-targets -- -D warnings`
- Tests: `cargo test --locked -p europacss`
- One suite: `cargo test --locked -p europacss --test responsive`
- Package preview: `python3 scripts/package-rust.py`

Follow nearby Rust style. Diagnostics should retain authored source locations. Meaningful regression cases live in `crates/europacss/tests`; frozen legacy expectations record intentional differences. Do not regenerate expectations blindly from compiler output.

## Optional tooling

- Vite adapter: `packages/vite` (`npm ci`, then `npm test`; tests use Node 22).
- HTML docs: `docs` (`yarn install --frozen-lockfile`, then `yarn dev` or `yarn build`).
- CodeMirror assets: `tools/studio-editor` (`npm ci`, then `npm run build`). Commit generated assets/notices. Ordinary Cargo builds use the checked-in bundle.

See [development docs](docs/guide/development.md) and [release notes](RELEASE.md). Local builds do not authorize publication.

## Legacy JavaScript implementation

The PostCSS implementation is no longer in this branch. Its last release is tag `1.0.0-beta.16`; `1.0.0-beta.6` and `1.0.0-beta.11` are the other versions `europa migrate` models. Read the old behavior with `git show 1.0.0-beta.16:<path>`, or check out the tag in a separate worktree to run its Jest suite (`yarn install --frozen-lockfile`, `yarn test`).
