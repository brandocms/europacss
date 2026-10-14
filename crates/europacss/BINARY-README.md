# EuropaCSS native compiler — experimental preview

The `europa` executable needs no Node, npm, Python, or Rust installation. Use the
archive for your operating system and CPU. Linux GNU builds require the runner's
glibc version or newer; these previews are not portable musl builds.

From this directory:

```sh
./europa examples/app.css --config examples/europa.json5 -o app.css --source-map
./europa examples/app.css --config examples/europa.json5 -o app.css --watch
./europa studio --config examples/europa.json5
./europa --help
```

On Windows use `europa.exe`. To compile your project, provide its entry stylesheet,
JSON5 configuration, and output path. The output directory must already exist.
The binary resolves local imports; it does not install dependencies or run JavaScript.

Studio prints a local browser URL for live JSON5 typography, spacing, and grid
previews. It can load project fonts from a sibling `css/includes/fonts.css` and
`public` directory, or explicit `--fonts` / `--public-dir` paths. Export downloads
your edits with comments intact; it does not overwrite the source config.

Native CSS nesting, non-media declaration order and contiguous named breakpoint ranges intentionally differ from legacy EuropaCSS. Common rules precede responsive rules within each scope; media retain their relative order and enclosing layers/conditions.
Before migrating an existing site, run:

```sh
./europa migrate path/to/app.css --from 1.0.0-beta.16 --config europa.json5 --json
```

Review findings and compare rendered pages. `--fix` rewrites supported suffix
selectors; it never chooses a different appearance for you. Versioned migration
analysis supports beta.6, beta.11 and beta.16, is bounded, and does not prove complete visual equivalence.

These archives are preview build artifacts. They are unsigned and not notarized.
`manifest.json` records target/toolchain details and file checksums. `Cargo.lock`,
`dependencies.json`, and `licenses/` record upstream versions and available notices.
Some crate tarballs omit license files; completing those notices is still required
before public distribution. No automated package publication is configured.

Source and compiler documentation: https://github.com/brandocms/europacss


There is no standalone `europa lint` command. Compile to validate current CSS/config,
or use `migrate --check` for versioned legacy checks. The optional Vite adapter is
in the source checkout and runs this executable; it is not bundled as a Node binding.
The source repository's `docs/` directory contains the HTML documentation site.
