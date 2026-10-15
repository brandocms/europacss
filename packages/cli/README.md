# EuropaCSS CLI

Prebuilt native EuropaCSS compiler, Config Studio and migration tools. Requires
Node 22.12+ or Node 24+ for the npm launcher; the native executable itself needs
neither Node nor Rust. Browser comparison additionally needs Chromium with CDP.

```sh
pnpm add -D --save-exact @brandocms/europacss-cli@0.1.0-beta.0
pnpm exec europa --version
pnpm exec europa css/app.css --config europa.json5 -o public/app.css
pnpm exec europa migrate css/app.css --from 1.0.0-beta.6 --config europa.json5
```

Create the output directory before compiling. All normal CLI commands, including
`migrate-config`, `compare`, `studio`, `--watch` and `--source-map`, are available.

The npm release includes binaries for macOS arm64/x64, Linux arm64/x64 with
glibc or musl, and Windows x64. The matching platform package is installed as an
exact-version optional dependency. Keep optional dependencies enabled. There are
no install scripts, external binary downloads or compiler toolchain requirements.
Install dependencies inside the target Docker image; do not copy `node_modules`
from a Mac into Linux. Native archives are unsigned and not notarized.

The Vite adapter depends on this package and resolves its executable directly:

```js
import europa from '@brandocms/vite-plugin-europacss';
export default { plugins: [europa()] };
```

Other integrations can use `getBinaryPath()` from `@brandocms/europacss-cli` to
obtain the absolute executable path. The launcher preserves arguments, standard
input/output, exit status and interrupt/termination signals.

The existing `@brandocms/europacss` package is the JavaScript/PostCSS implementation.
It does not install this CLI. See the [migration guide](https://brandocms.github.io/europacss/guide/lint-and-migration).

Maintainers: use `python3 scripts/package-npm.py --shared` from the repository
root to pack this package. That step generates the platform dependency map from
`platforms.json`; a direct `npm pack packages/cli` is not a release artifact.
