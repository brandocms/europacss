# Studio browser checks

Manual Playwright checks for `europa studio` in Chromium, Firefox and WebKit. They use an existing Playwright installation, so this directory has no dependencies. Start `europa studio` with the current binary, then run a script from the repository root:

```sh
node tools/studio-tests/studio.cjs /path/to/playwright/package.json http://127.0.0.1:PORT
```

`accessibility.cjs`, `editor.cjs` and `focused.cjs` take the same arguments. `fonts.cjs` starts Studio itself and takes a binary, an assets directory and a JSON5 config. `jupiter.cjs` compares Studio's zoom model with a local Jupiter checkout. The first lines of each script give its usage.
