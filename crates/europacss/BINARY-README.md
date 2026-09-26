# EuropaCSS native compiler — experimental preview

The `europa` executable needs no Node, npm, Python, or Rust installation. Use the
archive for your operating system and CPU. Linux GNU builds require the runner's
glibc version or newer; these previews are not portable musl builds.

From this directory:

```sh
./europa examples/app.css --config examples/europa.json5 -o app.css --source-map
./europa examples/app.css --config examples/europa.json5 -o app.css --watch
./europa --help
```

On Windows use `europa.exe`. To compile your project, provide its entry stylesheet,
JSON5 configuration, and output path. The output directory must already exist.
The binary resolves local imports; it does not install dependencies or run JavaScript.

Native CSS nesting and source order intentionally differ from EuropaCSS beta.16.
Before migrating an existing site, run:

```sh
./europa migrate path/to/app.css --from 1.0.0-beta.16 --config europa.json5 --json
```

Review findings and compare rendered pages. `--fix` rewrites supported suffix
selectors; it never chooses a different appearance for you. Versioned migration
analysis is bounded and does not prove complete visual equivalence.

These archives are preview build artifacts. They are unsigned and not notarized.
`manifest.json` records target/toolchain details and file checksums. `Cargo.lock`,
`dependencies.json`, and `licenses/` record upstream versions and available notices.
Some crate tarballs omit license files; completing those notices is still required
before public distribution. No automated package publication is configured.

Source and compiler documentation: https://github.com/brandocms/europacss
