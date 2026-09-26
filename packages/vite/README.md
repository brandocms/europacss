# EuropaCSS native compiler adapter for Vite

Experimental, local-only package. Tested with Vite 6.4.3. The compiler remains a
standalone Rust executable; this optional JavaScript adapter only connects it to
Vite. There are no N-API bindings or JavaScript config evaluation.

Build the binary with `cargo build --locked --release -p europacss`. In your application's
`vite.config.js`, import this package's `index.js` by local path, or add this
package as a local dependency. From your application's directory (replace the path):

```sh
npm install --save-dev /absolute/path/to/europacss/packages/vite
```

The [HTML docs source](../../docs/guide/vite.md) has the complete application workflow.

```js
import { defineConfig } from 'vite';
import europa from '@brandocms/vite-plugin-europacss';

export default defineConfig({
  plugins: [europa({
    binary: '/absolute/path/to/europacss/target/release/europa',
    config: './europa.json5',
    // Optional: only compile your own stylesheet entry points.
    include: (filename) => filename.replaceAll('\\', '/').endsWith('/css/app.css'),
  })],
  css: {
    devSourcemap: true,
    // Suppresses discovery of an old postcss.config.cjs.
    postcss: { plugins: [] },
  },
  build: { sourcemap: true },
});
```

Keep your normal `import '../css/app.css'`. Remove the old Europa PostCSS plugin
and any custom Europa config reload plugin. Convert static configuration first:

```sh
europa migrate-config europa.config.cjs -o europa.json5
```

If other PostCSS plugins are still needed, retain those in your PostCSS config and
omit the empty inline `css.postcss` setting. The adapter does not modify Vite's
PostCSS settings. Vite itself may still use PostCSS internally.

Options are documented in `index.d.ts`. The default executable is `europa` on
PATH; the default config is `europa.json5` relative to Vite's root. Use
`config: false` for Europa defaults. Browser target queries go in `targets`.

CSS is compiled before Vite's CSS pipeline. Vite still handles CSS modules,
asset URLs, extraction, minification and style injection. Ordinary CSS imports
are bundled by Rust; aliases, package imports, glob imports and virtual/SFC
styles are not supported by the native import resolver. `?raw` and `?url` requests
are deliberately left to Vite.

Local imports and JSON5 configuration are watched. Normal edits update affected
CSS modules through HMR; file creation/deletion uses a full reload to recover
missing inputs. Compiler errors retain their original filename/line/column.
Source maps currently have rule-level granularity.

The adapter launches one process per CSS compilation (30-second timeout), with
no generated CSS files. The `europa bridge` protocol accepts one JSON request on
stdin and emits one versioned JSON response on stdout. Failed responses include
attempted import paths, so a newly created missing dependency can recover a build.

For local tests, run `cargo build -p europacss`, then `npm ci` and `npm test` in this
directory using Node 22+. `EUROPA_BINARY` can select another compiled executable.
