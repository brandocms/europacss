import type { Plugin } from 'vite';
export interface EuropaOptions {
  /** Override the packaged compiler with an executable on PATH or a path relative to Vite's root. */
  binary?: string;
  /** JSON5 config path relative to Vite's root. Default: 'europa.json5'; false uses defaults. */
  config?: string | false;
  /** Filter absolute CSS filenames. Default: all physical .css modules. */
  include?: (filename: string) => boolean;
  /** Shared CSS browser policy, resolved by Rust and applied to Europa and Vite. Default: ['defaults']. Overrides Vite CSS targets; leaves JavaScript targets unchanged. */
  targets?: string[];
  /** Show font token labels as disabled properties in Chrome Styles during dev. Always omitted from production builds. Default: false. */
  debugTokens?: boolean;
}
export default function europa(options?: EuropaOptions): Plugin;
