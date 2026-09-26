# Bundled styles

`base.css` and `arrows.css` are snapshots of Europa's existing styles from `src/lib/plugins/css/`. They are embedded in the native executable and expanded at the `@europa` directive's position, retaining any surrounding CSS layer or conditional scope.

`normalize.css` is the unmodified normalize.css 8.0.1 stylesheet, copied from the repository's existing dependency. Its [MIT license](normalize.LICENSE.md) is retained here; the stylesheet's license header is unchanged. Building or running the Rust compiler does not read `node_modules` or require Node.

Generated source locations currently map to the authored `@europa` directive. These are built-in assets, so no files are loaded at runtime.
