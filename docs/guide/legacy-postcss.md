# Legacy PostCSS setup

This page describes the JavaScript implementation represented by `@brandocms/europacss` beta.16. The main guides describe the experimental native compiler. For an existing site's upgrade, follow [lint and migration](./lint-and-migration) before replacing the pipeline.

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

## Differences to expect when migrating

The native compiler expands rules in source order and follows native CSS nesting. It closes fractional gaps between named breakpoint ranges and uses Lightning CSS for target transforms. The reference pages show the native behavior; legacy output, callback handling and media packing can differ.

Convert the config with `europa migrate-config`, run a versioned migration check, and compare representative rendered pages. A successful build alone does not establish unchanged appearance.
