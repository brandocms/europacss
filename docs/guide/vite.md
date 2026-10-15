# Vite

The optional adapter runs the native `europa` executable before Vite's CSS pipeline. It provides builds, HMR, dependency watching and source maps without native Node bindings. Vite still needs Node; the standalone compiler and Studio do not.

The native adapter supports Vite 6.4.3 and 8.3.0+ on Node 22.12+ and Node 24+. The first npm release is being prepared as `0.1.0-beta.0`.

## Install the packages

Once the beta is published, from your application's directory:

```sh
pnpm add -D --save-exact @brandocms/vite-plugin-europacss@0.1.0-beta.0 @brandocms/europacss-cli@0.1.0-beta.0
```

The adapter installs an exact compiler dependency and resolves its executable directly. Adding the CLI as a direct dependency also exposes `pnpm exec europa` for migration commands. No global executable or Rust toolchain is required. Keep optional dependencies enabled so npm/pnpm installs the matching platform binary. Installation works with scripts disabled.

In Docker, install inside `node:22` or `node:24` with the committed lockfile, then run `pnpm build`. The release matrix tests both images, plus their Alpine variants. Native binaries are build dependencies and need not be copied into the application's runtime image.

## Configure Vite

Create or update `vite.config.js`:

```js
import { defineConfig } from 'vite';
import europa from '@brandocms/vite-plugin-europacss';

export default defineConfig({
  plugins: [
    europa({
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
  build: { sourcemap: true, cssMinify: 'lightningcss' },
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
| `binary` | Packaged compiler | Optional override: executable on `PATH`, or a path resolved from Vite's root. |
| `config` | `'europa.json5'` | Config path relative to Vite's root; `false` uses built-in defaults. |
| `include` | All physical `.css` modules | Function receiving an absolute filename; return `true` to compile it. |
| `targets` | `['defaults']` | Shared CSS browser policy for Europa and Vite. |

The adapter's config default differs from the CLI, where `--config` is always explicit.

## One CSS browser policy

Set browser support in `europa({ targets: [...] })`. At startup, the native executable resolves the Browserslist queries. The adapter gives that policy to Europa's browser transforms, Vite's `build.cssTarget` and `css.lightningcss.targets`. Do not configure those two Vite CSS settings separately: the adapter replaces them, including the CSS default from `@vitejs/plugin-legacy`. A later plugin that changes them causes an error.

Both CSS passes remain useful. Europa expands directives and applies browser transforms; Vite processes the assembled stylesheets and minifies the final CSS, including third-party styles that bypass Europa. Use `build.cssMinify: 'lightningcss'` for that final pass. Vite 6 requires installing `lightningcss` in your application; [Vite 8 already includes it](https://vite.dev/blog/announcing-vite8#install-size). The adapter preserves your minifier choice; it does not turn minification on or off. An esbuild minifier also receives the shared targets, but does not replace Lightning CSS's prefixing of styles that bypass Europa.

This policy controls **CSS only**. Keep JavaScript support in `build.target` and the options for `@vitejs/plugin-legacy`; the adapter does not change those settings. The legacy plugin supplies JavaScript compatibility, not CSS prefixing.

Vite accepts fewer browser families than native Lightning CSS. The adapter maps modern Android and Samsung Internet to their Chromium versions, merges the oldest required engine versions, and rounds patch versions down to the corresponding major/minor floor for both passes. Stock Android Browser and unknown Samsung releases fail explicitly rather than being silently dropped. Samsung mappings are checked into the adapter; updating them does not require a JavaScript Browserslist database. The standalone CLI continues to use its own `--targets` policy directly.

The adapter and packaged compiler versions are pinned together. For compiler development, set `binary` to an explicit build path; that executable must support `europa bridge targets`.

## Imports, reloads and errors

The Rust bundler resolves exact relative CSS imports before Vite sees the result. For imports that are not local files, the adapter asks Vite to resolve package exports and aliases, then supplies the resulting absolute paths to Rust. Imports such as `@import "tippy.js/dist/tippy.css" layer(vendor);` stay inside the same native compilation, retaining qualifiers, asset rebasing, dependency tracking, and source maps. The standalone CLI also resolves package imports through ancestor `node_modules` directories and package `exports`/`style` fields; Vite-specific aliases require the adapter. Globs and virtual Vue/Svelte styles are not supported. `?raw` and `?url` imports are left to Vite.

Changes to a used JSON5 config or local CSS dependency update the affected CSS through HMR. Creating or deleting files uses a full reload to recover missing inputs. Compiler diagnostics retain their originating file, line and column. Source maps locate individual declarations and Europa directives when their origin is unambiguous. A shorthand combined from several authored declarations keeps the containing rule's location. Rules that Lightning CSS does not map, such as keyframe steps, remain unmapped. Unreliable backend columns after non-ASCII text on the same generated line are also left unmapped rather than pointing at an unrelated rule.

The complete [`extends` chain](./configuration#inherit-a-shared-config) is tracked,
including newly selected and missing parent configs. Vite ignores `node_modules`,
so the adapter polls only the used dependency files there and performs a full
reload when they change. Successful builds remove obsolete dependencies from
this tracking. Setting `server.watch: null` also disables the adapter's polling.

For font token labels in Chrome's Styles pane, enable `europa({ debugTokens: true })`. The development CSS includes comments such as:

```css
font-size: 20px; /* --ec-font-token: "typography.sizes.body"; */
```

Chrome recognizes the declaration inside this comment as a disabled property, so the token label appears alongside the size without changing computed styles. Labels identify sizes generated by `@fontsize` and the size argument of `@font`, including responsive variants. Literal sizes and ambiguous merged origins have no label. Labels are always omitted from Vite production builds, including builds with `cssMinify: false`.

Use Vite's default CSS transformer with `css.devSourcemap: true`. A subsequent transformer such as `css.transformer: 'lightningcss'` can strip these comments and reduce source-map precision. The production setting `build.cssMinify: 'lightningcss'` is fine.


Each CSS compilation launches one native process, with a 30-second timeout. It does not generate intermediate CSS files. If the packaged executable is missing, reinstall with optional dependencies enabled on the build platform. If using a `binary` override, check that path and its executable permissions.

For existing sites, [convert and review the legacy source](./lint-and-migration) before switching the pipeline.
