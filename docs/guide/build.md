# Build and watch

These commands compile your site's CSS with the native executable. To build or test Europa itself, see [development](./development).

## Production CSS

From your project directory, with `europa` on `PATH`:

```sh
mkdir -p public
europa css/app.css --config europa.json5 \
  --targets 'defaults' --minify --source-map -o public/app.css
```

The compiler expands Europa directives, bundles local imports and transforms CSS for the selected browsers. `--minify` requests compact output. Source maps go to `public/app.css.map`, with a reference added to the CSS. Output directories must already exist.

## Browser targets

`--targets` accepts a Browserslist query; the default is `defaults`. Queries run inside the Rust backend. Set them explicitly when comparing a legacy build or requiring a particular support policy:

```sh
europa css/app.css --config europa.json5 \
  --targets 'chrome 100, firefox 100, safari 15' -o public/app.css
```

The native CLI uses its `--targets` argument, not the old plugin's `presetEnv` options. Modern targets may retain CSS nesting; older targets receive lowered selectors. Both preserve native nesting specificity and use [common-before-responsive ordering](../reference/cascade) within each scope. The default output is not a promise of byte-for-byte equivalence with PostCSS.

In Vite, use the adapter's [`targets` option](./vite#one-css-browser-policy). It shares one CSS policy between Europa's transforms and Vite's final CSS pass; JavaScript targets remain separate.

## Watch mode

```sh
europa css/app.css --config europa.json5 \
  --source-map -o public/app.css --watch
```

Watch mode builds immediately, then polls source/config contents every 250 ms. It follows the current local import graph, picks up newly added imports and recovers after errors. Compiler errors keep the previous successful output. Output files do not trigger another build. Asset contents and remote URLs are not watched.

`--watch` requires a file input and `-o`; it cannot use stdin. In a Vite application, use the [adapter's HMR](./vite) instead of running a second watch compiler for the same entry.

## Imports and assets

```css
@import './fonts.css';
@import './components/card.css';
@europa base;

.page {
  @space container;
}
```

Local imports need exact file paths, including extensions. CSS imports can carry media, `supports()` and layer conditions. Relative asset URLs are rebased for the output CSS location; assets are not copied. Bare CSS imports are resolved from the importing file through ancestor
`node_modules` directories, including scoped packages. Package `exports` takes
precedence (exact subpaths, patterns, and `style`/`browser`/`import`/`default`
conditions in declaration order); private/unexported paths fail. Without
`exports`, a bare package uses `style` or `index.css`, and package subpaths use
exact files. The CLI never evaluates JavaScript package entry points. Package
manifests participate in watches and migration review snapshots.
Vite aliases and custom resolver conditions still belong to the Vite adapter;
they are not inferred by the CLI. Globs are unsupported. Remote and root-relative imports remain browser imports where CSS ordering permits them; the compiler does not fetch them.

## Standard input and output

Omit `-o` to send CSS to stdout:

```sh
europa css/app.css --config europa.json5 --minify > public/app.css
printf '.example { @space padding 12px; }' | europa - --config europa.json5
```

Stdin does not resolve local imports. Diagnostics and build summaries go to stderr, so they do not contaminate CSS on stdout. Shell redirection can truncate its destination before a failed build; use `-o` when retaining the last successful output matters.

## CLI options

| Option | Behavior |
| --- | --- |
| `--config <file>` | Load `.json5` or strict `.json`; omitted means built-in defaults. |
| `-o`, `--output <file>` | Write CSS to an existing directory; default is stdout. |
| `--targets <query>` | Browser targets; default `defaults`. |
| `--minify` | Compact generated CSS. |
| `--debug-tokens` | Add development font token labels; ignored with `--minify`. |
| `--source-map` | Write an adjacent external map; requires `-o`. |
| `--watch` | Rebuild file input and config changes; requires `-o`. |
| `--color auto\|always\|never` | Control terminal colors. Auto respects `NO_COLOR`. |
| `-q`, `--quiet` | Hide success summaries; keep warnings and errors. |
| `-h`, `--help` | Show usage. |
| `-V`, `--version` | Show the native compiler version. |

A compilation failure exits with status 1. Diagnostics include a source file, line, column and error code. Source maps locate individual declarations and Europa directives when the origin is unambiguous. Shorthands combined from several authored declarations retain the containing rule location. Rules that Lightning CSS does not map, such as keyframe steps, remain unmapped. Unreliable backend columns after non-ASCII text on the same generated line are also left unmapped rather than pointing at an unrelated rule. For migration-specific checks, use [the migration command](./lint-and-migration).


## Font token labels in DevTools

Use `--debug-tokens` during development to add labels beside generated font sizes:

```sh
europa css/app.css --config europa.json5 --debug-tokens --source-map -o public/app.css
```

```css
font-size: 20px; /* --ec-font-token: "typography.sizes.body"; */
```

Chrome displays the declaration-shaped comment as a disabled property in Styles. It has no effect on computed CSS. Labels cover token sizes from `@fontsize` and `@font`; literals and ambiguous merged origins are left unlabeled. Source maps also retain token names. `--minify` omits labels. For Vite, use [`debugTokens: true`](./vite) instead; that option automatically excludes production builds.
