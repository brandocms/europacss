# Europa Studio

Studio is a local browser interface served by the native executable. It previews JSON5 rules and provides an interactive migration review. It needs no Node, separate dev server or external editor service.

```sh
europa studio --config europa.json5
```

Open the URL printed in the terminal. Omit `--config` to explore the bundled demo, or select a port with `--port 54897`. By default the server chooses an available port on the loopback interface.

## Inspect your design system

- **Typography** shows each size token with computed size, line height and weight.
- **Spacing** shows token widths as rulers.
- **Grid & container** shows the container, padding and column fractions.
- **In context** combines selected tokens in an article, paragraphs, cards and buttons. Norwegian copy includes long words to expose wrapping problems.
- **Accessibility** checks sampled text scaling, specimen overflow and chosen color pairs.

The viewport control sets the iframe's layout width. **Fit view** only scales its display; it does not alter computed measurements. The zero-width mobile/iPhone preset previews at 375px. Breakpoint buttons and the slider let you inspect both sides of a boundary.

## Edit code or focus on one token

The JSON5 editor has syntax colors, indentation, folding, search and undo/redo. Lines remain unwrapped by default. Drag the divider for more room, or use **Expand editor**.

Hover a linked preview to highlight the source without scrolling or moving the caret. Click or use keyboard activation to reveal its source and open the focused editor. Editing JSON5 highlights affected specimens, including dependent aliases.

Focused editing supports existing scalar values: breakpoint entries, `*` fallbacks, `__base__` properties, references and `theme.extend` overrides. **Review change** shows the proposed value diff and compiles the candidate. **Apply to JSON5** makes one undoable edit while retaining comments and untouched formatting. If the source changes after review, review a new proposal before applying it.

Add new properties, edit arrays and override built-in defaults in the JSON5 editor. Focused editing does not serialize resolved defaults back into your config.

## Load project fonts

With `--config`, Studio looks for `css/includes/fonts.css` and `public` beside the config. For another layout:

```sh
europa studio --config config/europa.json5 \
  --fonts assets/css/includes/fonts.css \
  --public-dir assets/public
```

It serves local `@font-face` files and reports loaded faces or fallbacks. Remote URLs, stylesheet imports and `local()` substitutions are skipped. Font-family selection supplies the preview family; an explicit family in a type token takes precedence. Restart Studio to refresh its on-disk config/font snapshot.

## Accessibility settings

Choose a WCAG 2.2 AA or AAA contrast target, foreground/background colors and a canvas for transparency. Text checks sample breakpoint edges and intermediate widths, with optional small-text and abrupt-change hints. Reflow and text-spacing probes measure the isolated specimens.

The zoom setting is a model. Choose CSS only, proportional `--ec-zoom` compensation or Jupiter's Chrome DPR calculation. It affects the measurements, not your project's runtime or config. The report records that choice. Studio does not automate real-browser zoom or change Jupiter's behavior.

These checks help review tokens; they are not a site-wide conformance result. Export a report to retain measurements and settings.

## Keep your edits

Changes stay in the browser tab. **Export JSON5** downloads the authored text with comments intact. Studio does not overwrite source files, and refreshing does not save edits. Export before closing/reloading, then replace your project's config with the reviewed file.

Opening a different config in the browser changes the preview data, but not the server's font snapshot. Invalid config retains the last successful preview with an error notice and disables export until corrected.

## Review a migration

```sh
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --studio
```

Open the printed `/migration` URL. The equivalent command is `europa studio --entry css/app.css --from 1.0.0-beta.16 --config europa.json5`. Both check the entry and its local imports with the config on disk. Unsaved changes in Config Studio do not change the migration inputs.

The review queue groups findings by source location and category. Search for a file, property or rule, filter by source file, or switch between **To review**, **With edits** and **Decided**. Each item shows its explanation, surrounding source and affected properties/conditions. Proposed edits have highlighted before/after source panels.

- **Preserve old appearance** selects available source edits. If only some findings in an item have proposals, Studio states that coverage; the others remain for review.
- **Keep the new behavior** records the listed semantic changes as intentional and leaves the source untouched. For signed column offsets, the choice confirms the already-preserved legacy formula.
- **Review later** sets an item aside without accepting it.
- Syntax findings offer **Use the syntax rewrite** when supported. Syntax errors and incomplete analysis cannot be accepted.

Choosing an option never writes CSS. **Review selected edits** validates the selection against fresh analysis and shows all proposed edits by file. **Apply edits** checks the source/config snapshot again, writes only the compiler's selected proposals and reruns analysis. Changes made in another editor invalidate an old preview. Identical edits are applied once; conflicting overlaps are rejected before writing.

After applying edits, remaining decisions are cleared because their input snapshot has changed. Review the fresh results. Source files are replaced individually, preserving permissions; a multi-file operation is not a filesystem transaction. If a write fails partway through, Studio reports the number of files already updated and asks you to refresh.

### Save and resume your review

**Save review** downloads the report and your decisions. **Open review** restores them when the source version, files and resolved config still match. Studio also remembers choices in browser storage for reloads on the same server origin; download a review before ending the session or changing ports.

Reopen a Studio report with pending edits in Studio to continue. Once no edits are selected, its accepted findings can also be replayed with the CLI's `--accept` flag. The terminal workflow remains available for scripts; there is no need to hand-edit a report when using Studio.

A completed review covers the analyzer's listed checks. Compare rendered pages, breakpoint boundaries and interactions before shipping the migrated site.
