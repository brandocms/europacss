export interface Diagnostic {
  /** The stylesheet filename, or the config filename for configuration errors. */
  filename?: string
  code: string
  message: string
  /** Byte offset in the UTF-8 source. */
  offset: number
  /** 1-based; 0 when the error has no authored location. */
  line: number
  /** 1-based, in characters; 0 when the error has no authored location. */
  column: number
}

export interface CompileOptions {
  source: string
  /** JSON5 text as authored in europa.json5. `extends` is not available without files. */
  config?: string | object
  /** Default `input.css`. */
  filename?: string
  /** Default `europa.json5`. */
  configFilename?: string
  minify?: boolean
  sourceMap?: boolean
  debugTokens?: boolean
  /** Browserslist queries. Empty means `defaults`. */
  browsers?: string[]
  /**
   * Compile the source as the body of this selector, such as `[b-tpl="hero"]`.
   * Rules that can select outside it, and page-wide at-rules, are `EU_SCOPE` errors.
   */
  scope?: string
  /**
   * Which absolute URLs `url()`, `image-set()` and `@import` may name: `'allow'` (default),
   * `'deny'`, or exact host names. Relative and `data:` URLs are always allowed.
   * Others are `EU_EXTERNAL_URL` errors.
   */
  externalUrls?: 'allow' | 'deny' | string[]
}

export interface CompileResult {
  css: string | null
  map: object | null
  warnings: Diagnostic[]
  error: Diagnostic | null
}

export interface PreviewColor {
  name: string
  value: string
  compiled_value: string | null
  config_paths: string[][]
  dependency_paths: string[][]
}

export interface Preview {
  breakpoints: [string, number][]
  colors: PreviewColor[]
  families: [string, string][]
  specimens: object[]
  notes: string[]
  css: string
  root_css: string
}

export interface Compiler {
  readonly version: string
  compile(options: CompileOptions): CompileResult
  resolveConfig(config: string | object): { config: Record<string, any> } | { error: Diagnostic }
  preview(config: string | object): { preview: Preview } | { error: string }
}

export const wasmUrl: URL

export function createCompiler(options?: {
  wasm?: string | URL | Response | BufferSource | WebAssembly.Module
}): Promise<Compiler>
