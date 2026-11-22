# Legacy PostCSS setup

This page describes the JavaScript implementation represented by `@brandocms/europacss` beta.16. Its source is at the `1.0.0-beta.16` tag in the repository. The main guides describe the experimental native compiler. For an existing site's upgrade, follow [lint and migration](./lint-and-migration) before replacing the pipeline.

## Installation and configuration

```sh
yarn add --dev @brandocms/europacss@1.0.0-beta.16 postcss
```

In `postcss.config.cjs`:

```js
module.exports = {
  plugins: [
    require('@brandocms/europacss')({
      config: './europa.config.cjs',
      presetEnv: {
        browsers: ['defaults'],
      },
    }),
  ],
};
```

The old plugin can discover `europa.config.js` or `europa.config.cjs` when no config is supplied. It also accepts a direct config object. JavaScript configuration and callbacks belong to this legacy workflow.

```js
// europa.config.cjs
module.exports = {
  theme: {
    extend: {
      colors: { brand: '#6554cf' },
    },
  },
};
```

Keep the project's existing PostCSS build command. The legacy package has no native `europa` CLI. The native JSON5 loader does not evaluate this JavaScript file.

### Pipeline traps

- **Pass the config path directly unless you also pass `presetEnv`.** The plugin only unwraps `{ config: './europa.config.cjs' }` when `presetEnv` sits beside it. Without `presetEnv`, the object itself is read as the config, and the default theme silently applies: different breakpoints, 12 columns, and `@space`/`@column` rules that match nothing. Use `require('@brandocms/europacss')('./europa.config.cjs')` in that case.
- **Remove plugins europacss already runs.** It includes `postcss-preset-env` (and so autoprefixer), nesting, media-query packing and selector deduplication. It throws on `postcss-preset-env`, `postcss-nested` and the known packers. A separate autoprefixer only runs twice, so remove it as well.
- **Run `postcss-import` before europacss**, so that imported files are expanded too.
- **The config is read when the build starts.** A running Vite or watch process keeps compiling with the old theme until it is restarted.

## Differences to expect when migrating

The native compiler retains common-before-responsive ordering while preserving enclosing layers and conditions. It follows native CSS nesting, closes fractional gaps between named breakpoint ranges and uses Lightning CSS for target transforms. Non-media declarations expand in place, and overlapping media queries keep their authored order. See [cascade and layers](../reference/cascade); legacy output and callback handling can still differ.

Convert the config with `europa migrate-config`, run a versioned migration check, and compare representative rendered pages. A successful build alone does not establish unchanged appearance.
