# WebAssembly

The Rust compiler also builds for `wasm32-unknown-unknown`, for in-browser editing such as live block and module CSS in a CMS.

The module is the same compiler as the native executable, and its output is byte for byte the same. It has no imports: no wasm-bindgen glue, WASI, clock or network access. A compile usually takes well under a millisecond after the first one.

```sh
npm install @brandocms/europacss-wasm@beta
```

`@brandocms/europacss-wasm` ships with each native release, at the same version as `@brandocms/europacss-cli`, under the `beta` tag. The first release that includes it is the one after `0.1.0-beta.2`. Pin the same version as the site's CLI, so that the browser and the site build compile alike.

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
| `scope` | none | Compile `source` as the body of this selector. See [scoped styles](#scoped-styles). |
| `externalUrls` | `'allow'` | `'deny'`, or the hosts that absolute URLs may name. See [scoped styles](#scoped-styles). |

It never throws for invalid input. It returns `{ css, map, warnings, error }`:

- On success, `error` is `null` and `css` holds the stylesheet.
- On failure, `css` is `null` and `error` names the file. Stylesheet and JSON5 syntax errors include the 1-based `line` and `column`. Configuration errors found after parsing have line `0`.

## Scoped styles

A CMS that lets editors write CSS for one block or module can confine that CSS to the module and keep it from loading resources from other hosts:

```js
const result = europa.compile({
  source: moduleCss,
  config: siteConfig,
  scope: '[b-tpl="hero"]',
  externalUrls: ['example.com', 'cdn.example.com'],
})
```

`scope` compiles the source as the body of that selector, so `.inner { … }` becomes `[b-tpl="hero"] .inner`. The compiler nests the parsed source itself, so errors keep the author's lines and columns, and a stray `}` is a parse error instead of closing the scope early. Every rule must select the scope element or its descendants. These are `EU_SCOPE` errors:

- `&` followed by `~` or `+` where `&` is the scope element, as in `& ~ *` or `~ .next`. Siblings inside the module are fine, as in `.a ~ .b`.
- `&` inside a selector function such as `:not(&)`, `:is(&)` or `body:has(&)`.
- At-rules that apply to the whole page: `@keyframes`, `@font-face`, `@property`, `@import`, `@page`, `@scope`, the `@layer a, b;` statement, `@europa` and any other at-rule outside the list below.

Scoped styles can use Europa directives, placeholders with `@extend`, and `@media`, `@supports`, `@container`, `@layer` and `@starting-style` blocks. Ancestor conditions such as `body.dark & { … }` still select the scope element, so they're allowed.

A scope limits which elements the rules select, not what they draw. A fixed-position element can still cover the page.

`externalUrls` checks `url()`, `image-set()`, `image()`, `src()` and `@import` in the authored source:

- `'allow'` (the default) passes every URL through.
- `'deny'` rejects absolute and protocol-relative URLs, and every `@import`.
- An array of host names allows `http(s)` URLs on exactly those hosts. Subdomains must be listed separately.

Relative, root-relative, fragment and `data:` URLs are always allowed, except `data:` in `@import`. Other schemes, such as `javascript:`, are rejected. URLs are read the way browsers parse them, so CSS escapes, backslashes, stray whitespace and `user@host` forms can't hide a host. Violations are `EU_EXTERNAL_URL` errors at the URL.

Use both for CSS written in an admin and served on public pages. Attribute selectors with `url()` beacons can otherwise read form values, such as CSRF tokens, one character at a time. Neither option makes output safe to inline: `content: "</style>"` is valid CSS. Serve the result as a `text/css` file, or reject output that contains `</style` before inlining it.

The CLI takes the same options as `--scope` and `--external-urls`.

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

## Other hosts

Server runtimes such as Wasmtime (`wasmex` in Elixir) or Wasmer can load `europacss.wasm` without the JavaScript wrapper. The module has no imports, so instantiate it with an empty import object. Each call takes UTF-8 bytes and returns a UTF-8 JSON response, through the module's exported `memory`:

| Export | Signature | |
| --- | --- | --- |
| `europa_abi_version` | `() -> i32` | The interface version, currently `1`. Check it once after loading. |
| `europa_alloc` | `(len: i32) -> i32` | Allocates `len` bytes and returns a pointer. Write the request there. |
| `europa_compile` | `(ptr: i32, len: i32) -> i32` | Compiles a JSON request shaped like the `compile()` options, with `config` as JSON5 text. Returns a pointer to the response. |
| `europa_resolve` | `(ptr: i32, len: i32) -> i32` | Resolves a config, for `resolveConfig()`. The request is the raw `europa.json5` text. Returns `{"config": …}` or `{"error": …}`. |
| `europa_preview` | `(ptr: i32, len: i32) -> i32` | Config Studio preview data, for `preview()`. Takes the same raw JSON5 text as `europa_resolve`. |
| `europa_result_len` | `() -> i32` | The byte length of the last response. |
| `europa_version` | `() -> i32` | A pointer to the compiler version as UTF-8 text; its length is `europa_result_len()`. |
| `europa_free` | `(ptr: i32, len: i32)` | Frees a request or response buffer. |

A compile looks like this:

1. Encode the request as UTF-8 JSON, for example `{"source": "...", "config": "<europa.json5 text>", "filename": "module.css"}`.
2. `europa_alloc(len)`, then write the bytes at the returned pointer.
3. `europa_compile(ptr, len)` returns the response pointer, and `europa_result_len()` returns its length.
4. Read the response, the `{ css, map, warnings, error }` object described above. Then call `europa_free` on both the request and the response.

The pointers are offsets into `memory`. Read them after each call, because a call can grow memory and move its buffer.

An instance handles one call at a time. Run one instance per process, or a small pool, behind something that serializes calls, such as an Elixir GenServer. Compile the module once and instantiate it from that. A Rust panic traps the call and leaves the instance unusable, so discard it, start a new one, and report the trap as an internal error. Error `offset` values are byte offsets into the UTF-8 source. Lines and columns are 1-based, and columns count characters.

## Build the module

```sh
rustup target add wasm32-unknown-unknown
python3 scripts/build-wasm.py
cd packages/wasm && npm test
```

The script builds the `wasm` Cargo profile (size-optimized, with LTO). It checks that the module has no imports and writes `europacss.wasm` to `packages/wasm`. It also writes `THIRD-PARTY-NOTICES.txt` and `dependencies.json` for the Rust crates in the build. The module is about 5.4 MB, or about 0.7 MB with brotli. Browsers cache it after the first visit.
