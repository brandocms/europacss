# Studio editor asset maintenance

The native binary embeds `crates/europacss/studio/editor.bundle.js`. **Building or
running Europa/Studio needs no Node installation, npm install, CDN, or network.**

This isolated maintainer directory regenerates the checked-in browser asset:

```sh
cd tools/studio-editor
npm ci --ignore-scripts
npm run build
```

Dependencies are pinned in package.json/package-lock.json. The bundle contains
CodeMirror 6, its JSON5-compatible JavaScript expression grammar, and JSON5 key
decoding. Config validation/compilation stays in Rust; no config code is executed.
Build output includes the exact runtime dependency inventory and upstream MIT
license texts. Native archives include both files, and Studio serves the notices
at `/editor.LICENSES.txt`.

`editor.js` provides source ranges for the **current** editor document using parsed
property paths and UTF-16 editor positions, independent of compiler byte offsets.
The Rust preview response supplies authored source paths after theme.extend and
reference resolution. Hover decorations never change selection/focus or request a
scroll; explicit reveal unfolds and scrolls to the source. Programmatic document
loads reset undo history, and local edits preserve untouched line endings.

UI checks (use an existing Playwright installation):

```sh
node tools/studio-tests/editor.cjs /path/to/playwright/package.json http://127.0.0.1:PORT
```

Run from the repository root with `europa studio` serving the current binary.
