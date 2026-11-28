# @brandocms/europacss-wasm

The EuropaCSS compiler as an import-free WebAssembly module, for browsers, live editors and non-Node hosts. It is the same Rust compiler as `@brandocms/europacss-cli`, and its output is byte for byte the same.

```js
import { createCompiler } from '@brandocms/europacss-wasm'

const europa = await createCompiler()
const { css, error } = europa.compile({ source, config: europaJson5Text })
```

Use the same version as the site's `@brandocms/europacss-cli`. See the [WebAssembly guide](https://brandocms.github.io/europacss/guide/webassembly) for the API, its limits and the raw ABI for other hosts.
