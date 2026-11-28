// EuropaCSS in the browser: the native Rust compiler as an import-free WebAssembly module.
// No Node APIs are needed to compile; Node only uses node:fs to load the module file.

const ABI_VERSION = 1
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** URL of the bundled module, for preloading or custom fetching. */
export const wasmUrl = new URL('./europacss.wasm', import.meta.url)

async function load(source) {
  if (source instanceof WebAssembly.Module) return source
  if (source instanceof ArrayBuffer || ArrayBuffer.isView(source)) return WebAssembly.compile(source)
  if (typeof Response !== 'undefined' && source instanceof Response) {
    return WebAssembly.compileStreaming
      ? WebAssembly.compileStreaming(source)
      : WebAssembly.compile(await source.arrayBuffer())
  }
  const url = new URL(source ?? wasmUrl)
  if (url.protocol === 'file:') {
    const fs = 'node:fs/promises'
    const { readFile } = await import(/* @vite-ignore */ fs)
    return WebAssembly.compile(await readFile(url))
  }
  return load(await fetch(url))
}

/**
 * Load the compiler. `wasm` may be a URL, Response, bytes or a compiled
 * WebAssembly.Module; it defaults to the europacss.wasm next to this file.
 */
export async function createCompiler({ wasm } = {}) {
  const module = await load(wasm)
  let exports
  const start = () => {
    exports = new WebAssembly.Instance(module, {}).exports
    if (exports.europa_abi_version() !== ABI_VERSION) {
      throw new Error(`europacss.wasm ABI ${exports.europa_abi_version()} does not match this wrapper (${ABI_VERSION})`)
    }
  }
  start()

  const read = (pointer) => {
    const length = exports.europa_result_len()
    // Reading after the call: memory may have grown and replaced its buffer.
    const text = decoder.decode(new Uint8Array(exports.memory.buffer, pointer, length))
    exports.europa_free(pointer, length)
    return text
  }
  const call = (name, input) => {
    const bytes = encoder.encode(input)
    let output
    try {
      const pointer = exports.europa_alloc(bytes.length)
      new Uint8Array(exports.memory.buffer, pointer, bytes.length).set(bytes)
      output = read(exports[name](pointer, bytes.length))
      exports.europa_free(pointer, bytes.length)
    } catch (error) {
      if (!(error instanceof WebAssembly.RuntimeError)) throw error
      // A Rust panic traps and leaves the instance unusable; start a fresh one.
      start()
      return { internalError: error.message }
    }
    return JSON.parse(output)
  }
  const version = read(exports.europa_version())

  return {
    version,
    /**
     * Compile Europa CSS. `config` is JSON5 text (an object is serialized as JSON).
     * Never throws for invalid CSS or config: check `error`.
     */
    compile({ source, config, ...options }) {
      if (config != null && typeof config !== 'string') config = JSON.stringify(config)
      const result = call('europa_compile', JSON.stringify({ source, config, ...options }))
      if (!result.internalError) return result
      return { css: null, map: null, warnings: [], error: { code: 'EU_INTERNAL', message: `The compiler crashed (${result.internalError}). Please report this input.`, offset: 0, line: 0, column: 0 } }
    },
    /**
     * The config after defaults, `theme.extend` and `{…}` references:
     * `{ config }` or `{ error }` with a located diagnostic.
     */
    resolveConfig(config) {
      const result = call('europa_resolve', typeof config === 'string' ? config : JSON.stringify(config))
      return result.internalError ? { error: { code: 'EU_INTERNAL', message: result.internalError, offset: 0, line: 0, column: 0 } } : result
    },
    /** Config Studio's token preview for JSON5 config text: `{ preview }` or `{ error }`. */
    preview(config) {
      const result = call('europa_preview', typeof config === 'string' ? config : JSON.stringify(config))
      return result.internalError ? { error: `The compiler crashed (${result.internalError})` } : result
    },
  }
}
