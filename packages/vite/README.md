# EuropaCSS native compiler adapter for Vite

Native beta package. Supports Vite 6.4.3 and 8.3.0+ on Node 22.12+ and Node 24+. The compiler remains a
standalone Rust executable; this optional JavaScript adapter only connects it to
Vite. There are no N-API bindings or JavaScript config evaluation.

Install the matching adapter and CLI beta in your application:

```sh
pnpm add -D --save-exact @brandocms/vite-plugin-europacss@0.1.0-beta.0 @brandocms/europacss-cli@0.1.0-beta.0
```

The adapter has an exact dependency on the CLI package. It resolves the native
executable from that dependency without searching PATH. Installing the CLI
directly also exposes `pnpm exec europa` for migration and other commands.
Platform binaries come from npm optional dependencies, with no install scripts,
Rust toolchain or separate binary downloads. Keep optional dependencies enabled.

The [HTML docs source](../../docs/guide/vite.md) has the complete application workflow.

```js
import { defineConfig } from 'vite';
import europa from '@brandocms/vite-plugin-europacss';

export default defineConfig({
  plugins: [europa({
    config: './europa.json5',
    targets: ['defaults'], // One CSS policy for Europa and Vite.
    // Optional: only compile your own stylesheet entry points.
    include: (filename) => filename.replaceAll('\\', '/').endsWith('/css/app.css'),
  })],
  css: {
    devSourcemap: true,
    // Suppresses discovery of an old postcss.config.cjs.
    postcss: { plugins: [] },
  },
  build: { sourcemap: true, cssMinify: 'lightningcss' },
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

Options are documented in `index.d.ts`. The default executable is the packaged
compiler; the default config is `europa.json5` relative to Vite's root. Use
`config: false` for Europa defaults. Browser target queries go in `targets`.

The native executable resolves that CSS policy once at Vite startup. The adapter
shares the resulting engine floors with Europa, `build.cssTarget` and
`css.lightningcss.targets`, replacing separate CSS targets and legacy-plugin CSS
defaults. JavaScript targets and legacy bundles are unchanged. Both CSS passes
remain enabled. Vite 6 requires installing `lightningcss` in the application for
the final minifier shown above; [Vite 8 includes it as a regular dependency](https://vite.dev/blog/announcing-vite8#install-size). The adapter preserves your minifier choice.

Modern Android and Samsung Internet targets map to Chromium; patch floors round
down to major/minor in both passes. Unsupported stock Android and unknown Samsung
releases fail explicitly. See the [target policy details](../../docs/guide/vite.md#one-css-browser-policy).
For compiler development, `binary: '/absolute/path/to/europacss/target/release/europa'`
overrides the packaged compiler. The executable must support `europa bridge targets`.

CSS is compiled before Vite's CSS pipeline. Vite still handles CSS modules,
asset URLs, extraction, minification and style injection. Ordinary CSS imports
are bundled by Rust. For imports that are not exact local files, the adapter
asks Vite to resolve package exports and aliases, then passes absolute paths to
Rust. Layer/supports/media qualifiers, source maps, and per-file asset rebasing
are retained. Globs and virtual/SFC imports are unsupported. `?raw` and `?url` requests
are deliberately left to Vite.

Local imports and JSON5 configuration, including the complete `extends` chain,
are watched. Normal edits update affected CSS modules through HMR; file
creation/deletion uses a full reload to recover missing inputs. Vite ignores
`node_modules`, so the adapter polls only the used dependency files there and
reloads when they change. Removed dependencies stop triggering updates, and
`server.watch: null` disables this polling. See [config inheritance](../../docs/guide/configuration.md#inherit-a-shared-config)
for sharing a preset with local overrides. Compiler errors retain their original filename/line/column.
Source maps locate individual declarations and Europa directives when their origin is unambiguous. A shorthand combined from several authored declarations keeps the containing rule's location. Rules that Lightning CSS does not map, such as keyframe steps, remain unmapped. Unreliable backend columns after non-ASCII text on the same generated line are also left unmapped rather than pointing at an unrelated rule.

For font token labels in Chrome's Styles pane, enable `europa({ debugTokens: true })`. The development CSS includes comments such as:

```css
font-size: 20px; /* --ec-font-token: "typography.sizes.body"; */
```

Chrome recognizes the declaration inside this comment as a disabled property, so the token label appears alongside the size without changing computed styles. Labels identify sizes generated by `@fontsize` and the size argument of `@font`, including responsive variants. Literal sizes and ambiguous merged origins have no label. Labels are always omitted from Vite production builds, including builds with `cssMinify: false`.

Use Vite's default CSS transformer with `css.devSourcemap: true`. A subsequent transformer such as `css.transformer: 'lightningcss'` can strip these comments and reduce source-map precision. The production setting `build.cssMinify: 'lightningcss'` is fine.


The adapter launches one target-resolution process at startup and one process per CSS compilation (30-second timeout), with
no generated CSS files. The `europa bridge` protocol accepts one JSON request on
stdin and emits one versioned JSON response on stdout. Failed responses include
attempted import paths, so a newly created missing dependency can recover a build.

For local tests, run `cargo build -p europacss`, then `npm ci` and `npm test` in
the parent `packages/` workspace using Node 22 or 24. `EUROPA_BINARY` can select
another compiled executable. Release tarballs are built with
`python3 scripts/package-npm.py --shared` from the repository root.
