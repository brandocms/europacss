# Vite

The optional adapter runs the native `europa` executable before Vite's CSS pipeline. It provides builds, HMR, dependency watching and source maps without native Node bindings. Vite still needs Node; the standalone compiler and Studio do not.

The adapter is a private, local package in this checkout, tested with Vite 6.4.3. There is no published native-adapter npm installation yet.

## Install from your checkout

Build or install the native compiler using [getting started](./getting-started). Then, from your Vite application's directory:

```sh
npm install --save-dev /absolute/path/to/europacss/packages/vite
```

Use the actual path to your native-compiler checkout. This records a local package dependency; that checkout must also be available wherever you build the app. The adapter accepts Node >=20.19; its integration tests use Node 22.

## Configure Vite

Create or update `vite.config.js`:

```js
import { defineConfig } from 'vite';
import europa from '@brandocms/vite-plugin-europacss';

export default defineConfig({
  plugins: [
    europa({
      binary: 'europa', // Executable on PATH, or an explicit path.
      config: './europa.json5',
      targets: ['defaults'],
      // Compile this entry; Rust follows its local CSS imports.
      include: filename => filename.replaceAll('\\', '/').endsWith('/css/app.css'),
    }),
  ],
  css: {
    devSourcemap: true,
    postcss: { plugins: [] },
  },
  build: { sourcemap: true },
});
```

Keep your application's normal stylesheet import, for example in `src/main.js`:

```js
import '../css/app.css';
```

Run your existing Vite commands (`vite` for development, `vite build` for production). You do not need to precompile `app.css` or start `europa --watch`. Vite handles CSS modules, URL assets, style injection, extraction and production minification.

The empty inline `css.postcss` configuration prevents Vite from loading an old PostCSS config. If other PostCSS plugins are still required, keep those and omit the empty inline setting. Remove the old Europa PostCSS plugin and any bespoke Europa config reload plugin so the same file is not processed twice. Vite may use PostCSS internally.

## Adapter options

| Option | Default | Meaning |
| --- | --- | --- |
| `binary` | `'europa'` | Executable on `PATH`, or a path resolved from Vite's root. |
| `config` | `'europa.json5'` | Config path relative to Vite's root; `false` uses built-in defaults. |
| `include` | All physical `.css` modules | Function receiving an absolute filename; return `true` to compile it. |
| `targets` | `['defaults']` | Browserslist queries for Europa's Rust backend. |

The adapter's config default differs from the CLI, where `--config` is always explicit. Vite's `build.target` does not set Europa's targets; use the adapter's `targets` option for those transforms.

## Imports, reloads and errors

The Rust bundler resolves relative CSS imports before Vite sees the result. Use exact relative paths, including `.css`. Vite aliases, package imports, globs and virtual Vue/Svelte styles are not supported by this resolver. `?raw` and `?url` imports are left to Vite.

Changes to a used JSON5 config or local CSS dependency update the affected CSS through HMR. Creating or deleting files uses a full reload to recover missing inputs. Compiler diagnostics retain their originating file, line and column. Source maps have rule-level granularity.

Each CSS compilation launches one native process, with a 30-second timeout. It does not generate intermediate CSS files. If the executable cannot start, check `binary`, executable permissions and the `PATH` seen by Vite.

For existing sites, [convert and review the legacy source](./lint-and-migration) before switching the pipeline.
