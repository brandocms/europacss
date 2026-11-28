# WebAssembly

The Rust compiler also builds for `wasm32-unknown-unknown`, for in-browser editing such as live block and module CSS in a CMS.

The module is the same compiler as the native executable, and its output is byte for byte the same. It has no imports: no wasm-bindgen glue, WASI, clock or network access. A compile usually takes well under a millisecond after the first one.

::: warning Not yet published
`@brandocms/europacss-wasm` lives in `packages/wasm` and is marked private. Build it from this repository as shown below.
:::

## Compile in the browser

```js
import { createCompiler } from '@brandocms/europacss-wasm'

const europa = await createCompiler()

const result = europa.compile({
  source: '.card { @space padding md; @color fg ink; }',
  config: `{
    theme: {
      breakpoints: { mobile: '0', desktop: '1024px' },
      spacing: { md: { mobile: '16px', desktop: '32px' } },
      colors: { ink: '#1d1638' },
    },
  }`,
})

if (result.error) {
  console.log(result.error.line, result.error.column, result.error.message)
} else {
  style.textContent = result.css
}
```

`createCompiler()` loads `europacss.wasm` from beside the wrapper, so bundlers such as Vite emit it as an asset. To load it yourself, pass `wasm`: a URL, a `Response`, bytes or a compiled `WebAssembly.Module`. In Node, the wrapper reads the file with `node:fs`.

`compile()` takes these options:

| Option | Default | |
| --- | --- | --- |
| `source` | | Europa CSS text. |
| `config` | built-in defaults | `europa.json5` text, or an object. |
| `filename` | `input.css` | Name used in diagnostics and source maps. |
| `configFilename` | `europa.json5` | Name used in configuration diagnostics. |
| `minify` | `false` | Compact output. |
| `sourceMap` | `false` | Return a source map object as `map`. |
| `browsers` | `defaults` | Browserslist queries for Lightning CSS. |
| `debugTokens` | `false` | Label generated font sizes. |

It never throws for invalid input. It returns `{ css, map, warnings, error }`:

- On success, `error` is `null` and `css` holds the stylesheet.
- On failure, `css` is `null` and `error` names the file. Stylesheet and JSON5 syntax errors include the 1-based `line` and `column`. Configuration errors found after parsing have line `0`.

## Inspect a config

```js
const { config } = europa.resolveConfig(json5Text)
config.theme.spacing // with defaults, theme.extend and {…} references applied

const { preview } = europa.preview(json5Text)
preview.colors // Config Studio's colour and specimen data
```

Editors can use `resolveConfig()` for token completions and hover cards.

## Limits

Without file access, the browser build cannot:

- Follow `extends`. Merge parent configs before calling `compile()`, or send the merged JSON.
- Inline local `@import` files. Concatenate them into `source` yourself.

A Rust panic stops the WebAssembly instance. The wrapper then starts a fresh instance and returns an `EU_INTERNAL` error. In an editor, compile on each change and keep the last good CSS while there are errors.

## Build the module

```sh
rustup target add wasm32-unknown-unknown
python3 scripts/build-wasm.py
cd packages/wasm && npm test
```

The script builds the `wasm` Cargo profile (size-optimized, with LTO). It checks that the module has no imports and writes `europacss.wasm` to `packages/wasm`. It also writes `THIRD-PARTY-NOTICES.txt` and `dependencies.json` for the Rust crates in the build. The module is about 5.4 MB, or about 0.7 MB with brotli. Browsers cache it after the first visit.
