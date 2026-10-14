# Lint and migration

There is no separate `europa lint` command yet. The current tools cover three different jobs:

| Job | Command |
| --- | --- |
| Validate today's Europa CSS and config | Compile the stylesheet. |
| Check changes from legacy EuropaCSS | `europa migrate … --from … --check` |
| Lint the Rust implementation | `cargo clippy` — see [development](./development). |

## Validate CSS without publishing output

Compilation validates the config, directives, imports and the CSS backend's syntax. To check an entry without writing a build file, discard stdout:

```sh
# POSIX shells
europa css/app.css --config europa.json5 --quiet > /dev/null
```

In PowerShell:

```powershell
europa css/app.css --config europa.json5 --quiet > $null
```

Errors exit with status 1. `--quiet` keeps diagnostics visible. These checks do not enforce formatting conventions, lint unused tokens or certify accessibility.

## Convert an existing config

Work on a migration branch and use the version the source was authored against. Supported profiles are `1.0.0-beta.6`, `1.0.0-beta.11` and `1.0.0-beta.16`; other versions are rejected rather than treated as equivalent.

```sh
europa migrate-config europa.config.cjs -o europa.json5
```

Conversion accepts JSON, JSON5, static `module.exports = { … }` and `export default { … }` objects. It also handles supported theme-section callbacks that simply return an object literal. JavaScript is never executed. Other callbacks, imports, spreads or computed expressions need conversion to data or token references. Existing output files are not overwritten.

For example, replace this legacy callback:

```js
'font-family': theme => theme.typography.families.main
```

with this JSON5 value:

```json5
'font-family': '{typography.families.main}'
```

Check [replacement and extension semantics](./configuration#defaults-and-extensions) before changing the shape of the config.

## Run the migration checks

For an interactive review, open [Migration Studio](./studio#review-a-migration):

```sh
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --studio
```

Open the printed URL. Studio groups repeated findings, explains the changes and shows source diffs. Choose **Preserve old appearance**, **Keep the new behavior**, or **Review later**. **Review selected edits** opens the complete edit preview; **Apply edits** writes those changes and reruns analysis. You do not need to edit JSON to use this workflow.

The commands below provide terminal and scriptable reports:

```sh
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --check
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --summary
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --details
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --json > migration.json
```

Replace the version with your actual supported source version. These commands are read-only. The entry and its local imports are checked using the supplied config. Exit 1 means unresolved findings or incomplete analysis, so a report can be useful even when the command fails. `--json` writes the full report to stdout; no CSS build is produced.

Expansion failures are collected across independent rules instead of stopping at
the first one. Unsupported `@row`, misplaced placeholders, unknown extensions,
and nested keyframes retain their compiler diagnostic codes and suggested next
steps. The report remains incomplete and cannot be accepted until those errors
are resolved. A structural parse/import/config failure can still prevent loading
the complete graph.

To retain per-branch nesting specificity without manually flattening parent
lists, select [`nesting: 'expanded'`](../reference/nesting#expanded-selector-mode)
in the config used by both migration and compilation. This also preserves
same-parent matching for repeated `&`. It does not eliminate authored `:has()`
or measure selector performance.

The default terminal report groups unresolved findings by source location and diagnostic code, showing one source excerpt per review item. Declaration-order items list the earlier source, affected properties and breakpoint conditions together. One `padding` declaration can produce comparisons for four sides across several breakpoints; those comparisons belong to one review item, not dozens of separate edits.

For a large site, `--summary` lists both review-item and finding counts by file and code. Use `--details` for each finding's full diagnostic, or `--json` for the complete machine-readable review. Grouping changes only presentation: every check still runs, the exit status is unchanged, and acceptance still applies to individual findings. Choose one output mode per command.

Neither the general report nor sizing warnings stop at 512 findings anymore. Selector-expansion and declaration-comparison budgets remain; reaching one still marks analysis incomplete and blocks acceptance.

Checks include:

- Native nesting specificity and matching, including selector-list parents and repeated `&`.
- Unsupported suffix nesting such as `&__title`.
- Declarations and repeated media rules whose legacy ordering differed.
- Named breakpoint boundaries that now cover fractional widths without gaps.
- Selected sizing changes, negative column intent and profile-specific differences.

Named ranges now meet at `< next-breakpoint`: the old `width <= 739px` becomes `width < 740px`. Explicit arrow endpoints and authored CSS media conditions remain unchanged. Negative `-1/4` still uses the legacy signed-column formula; [whole-width negation](../reference/space#reusable-negation) has a different meaning.

## Apply supported syntax fixes

```sh
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --fix
```

`--fix` writes supported suffix-selector rewrites and reruns analysis. A simple `.card { &__title { color: red; } }` can become `.card__title { color: red; }`. Complex/generated cases may require a manual edit. The command can still exit 1 after successful edits if other findings remain.

It does not change specificity, sizing, breakpoint semantics or declaration order on your behalf. Review the diff before continuing.

## Review appearance changes

For a supported adjacent declaration-order conflict, a beta.16 report may contain a `preserve-appearance` fix with exact edits. The terminal labels these proposals `--apply`, and the summary counts distinct proposals. Items without a proposal need manual review; `--fix` does not reorder them.

Export a JSON report, inspect each proposed edit and set `apply_fix: true` only on findings whose proposal you want:

```sh
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --json > migration.json
# Review the proposed edits and set apply_fix: true on the chosen findings.
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --apply migration.json
```

Several property or breakpoint findings can share the same edit. Selecting one is enough; selecting several applies an identical edit only once. This applies the compiler's verified proposals and reruns analysis. Changing the replacement text inside the saved report does not invent a new edit. `--apply-fixes` remains an alias for `--apply`. Beta.6 and beta.11 report differences without beta.16 appearance-edit proposals.

Once edits are finished, generate a **fresh** JSON report. For semantic changes you have reviewed and intend to keep, set `accepted: true` on those findings:

```sh
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --json > review.json
# Review findings and set accepted: true only where appropriate.
europa migrate css/app.css --from 1.0.0-beta.16 --config europa.json5 --accept review.json
```

Saving a report accepts nothing. Syntax errors and incomplete analysis cannot be accepted. Reviews are tied to the source version, analyzer revision, config, source paths and contents in the same checkout. Edits or a newer analyzer require a fresh review. Run `--fix`, `--apply` and `--accept` as separate stages.

Analyzer version 11 includes layer-scope and potential cross-selector ordering checks, expanded nesting, and independent compiler diagnostics. See [common-before-responsive ordering](../reference/cascade). Simple responsive/fallback pairs no longer need order warnings or source edits. Non-media append differences and overlapping media that legacy packing could reorder still need review. Regenerate reports from older analyzer versions, including version 10; changing their version field does not make them current. Grouped terminal output and the optional JSON `order` evidence do not change finding identity within the current version. Review input remains limited to 16 MiB, and automatic edit proposals have a separate size budget.

## Sources older than beta.6

There is no profile for 0.x sources (for example 0.6.1, the version Brando 0.51 sites shipped with). Convert the config, then run the checks with `--from 1.0.0-beta.6`, the closest profile. The report is a useful list of review items, but it does not cover everything that changed since 0.x. Each difference below was found on a 0.6.1 site by comparing its old and new builds page by page.

**`@europa base` is expanded where it is written.** 0.x put the bundles before the whole stylesheet, so authored rules always beat the reset. The native compiler expands them in source order. If the bundles come after the `@import`s, the reset now wins, and lists lose their authored margins, for example. `@import` must stay first, so move the bundles into a file of their own and import it before everything else:

```css
/* css/app.css */
@import './includes/bundles.css'; /* @europa base; @europa arrows; */
@import './includes/fonts.css';
```

`europa migrate` reports this placement as a review item.

**`typography.base` moved from `body` to `html`.** In 0.x the base bundle set `body { font-size }` from it. Now it sets `html { font-size }`, the size of 1rem. A 0.x config with `base: '20px'` therefore makes every `rem` value 25% larger. Set `base` to the root size the site actually rendered at, usually the browser's 16px.

**`vertical-rhythm()` scales the whole value.** 0.x multiplied only the last term of a fluid size. For example, `calc(18px + 6 * (…))` times 1.5 came out as roughly 24px at a width where the native result is 36px. The report flags each use (`EU_MIGRATION_SIZE`). To keep the old spacing, replace it with an explicit spacing token.

**Removed and changed at-rules:**

| 0.x | Now |
| --- | --- |
| `@row 2/wrap;` | Error `EU_DEPRECATED`. Preserve the explicit flex-wrap and child margins/nth-child resets shown below. CSS gap is not equivalent. |
| `@container;` | Parsed as a CSS container query and rejected. Use `@space container;`, which has the same output. |

For legacy 0.13, the explicit form of `@row 2;` is:

```css
.row {
  display: flex;
  flex-wrap: nowrap;
  > * {
    @space margin-left 1;
    &:nth-child(2n+1) { margin-left: 0; }
  }
}
```

For `@row 2/wrap;`, change only `flex-wrap` to `wrap`. Bare `@row;` resets
`:nth-child(1)`; `@row N;` resets `:nth-child(Nn+1)` even without wrapping.
For `@row N/wrap/GAP`, also apply `@space margin-top GAP` to children and reset
the first N children's `margin-top` to zero. Keep breakpoint-qualified rows
inside their equivalent responsive condition. The old plugin prepended
display/flex-wrap to the containing rule, so retain that placement when other
declarations override them. Child column offsets can interact with margin-left;
substituting `gap` changes those interactions. This is documented migration
guidance, not a new automatic appearance fix.

When introducing layers, keep a legacy package's component imports inside one
aggregate stylesheet and apply `layer(brando)` to that aggregate. Applying the
layer separately per component interrupts global responsive append order; see
[package scope](../reference/cascade#migrating-a-package-with-many-css-files).

**Errors where 0.x emitted something harmless:**

- `@keyframes` nested inside a rule: `EU_NESTED_KEYFRAMES` asks you to hoist it
  outside the selector while retaining its enclosing layer and conditions.
- IE hacks such as `*zoom: 1`: delete them.
- Unknown size keys (`@space padding-top lg` when `lg` is not a spacing key): 0.x wrote `NaNvw`, which browsers drop, so deleting the declaration changes nothing.

**Breakpoint edges and rounding.** Named ranges now meet at `width < 768px` instead of `width <= 767px`, and `calc()` precision differs. Text moves by fractions of a pixel, which is harmless, but a strict pixel diff then flags every page. Blur both screenshots slightly, or compare by maximum channel delta, before deciding something changed. To find the cause of a real difference, comparing element boxes and computed styles between the old and new builds is much faster than reading screenshots.

## Verify the site

A clean migration report covers its listed checks; it does not prove an identical site. Build with the intended [browser targets](./build#browser-targets), compare representative pages and interaction states, and inspect breakpoint boundaries. Studio is useful for token comparisons, but it cannot reproduce an entire site's cascade or layout.

Use [`europa compare`](./compare) to compare the two compiled stylesheets on the
same DOM, including computed properties and element boxes. It reports actual
cross-selector effects that source analysis can only identify as potential risks.

For CI, run the read-only check or replay a valid reviewed report before the production build. Never hide its nonzero status with `|| true`. Since reviews include canonical paths, a report saved in another checkout may need regeneration and review.
