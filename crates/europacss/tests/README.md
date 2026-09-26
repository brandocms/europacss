# Rust compiler test porting

Work in feature families, implementing shared parsing and value handling before duplicating it across rules. Each port includes successful legacy cases, malformed input, interaction with nesting/responsive scopes, source order, and useful diagnostics. Test the frontend where structure or source locations matter, then compare compiled output against hand-written standard CSS through the same Lightning backend. The Rust tests never invoke Node or the old compiler.

The original JS suite remains the behavior reference, with intentional native nesting and source-order changes recorded separately. Do not reproduce global media packing or declaration relocation merely to match old serialized output.

## First rule-by-rule batch

| Legacy suite in `__tests__/rules/` | Rust coverage | Notes |
| --- | --- | --- |
| `substituteIterateAtRules.test.js` (6 cases) | [iteration.rs](iteration.rs), [parser.rs](parser.rs) | Responsive values, surrounding declarations, custom-property names, quoted keys, missing arguments/children. Adds nested-loop scope, arrays, dot/slash paths, repeated substitution, expansion limits, and malformed generated syntax. |
| `substituteUnpackAtRules.test.js` (6 cases) | [unpack.rs](unpack.rs) | Property maps, both aliases, nesting, design-pixel conversion, missing arguments. Adds reference-width precedence, maximum conversion, arrays of CSS values, invalid config, source mapping, and later overrides. |
| `substituteAbs100AtRules.test.js` (9 cases) | [helpers.rs](helpers.rs) | Base/important declarations, breakpoints, collections, comparisons, responsive parents, invalid children/root/query combinations. Adds arrow ranges and source-order overrides. |
| `substituteEmbedResponsiveAtRules.test.js` (1 case) | [helpers.rs](helpers.rs) | Existing pseudo-element layout. Adds ratio validation, conditional scopes, parent-list specificity, and later overrides. |

These 22 legacy cases are represented by Rust assertions, sometimes grouped in one test or expanded into several. They are not the original Jest tests running against Rust. The pre-existing compiler/backend/config/CLI suites cover the earlier milestone; their legacy suites still need systematic case-by-case porting.

## Basic directive audit

[basic_rules.rs](basic_rules.rs) represents the legacy color (19 cases), display (8), order (4), and conditional (4) suites through grouped/table-driven assertions. It also covers every color target, nested native functions, hierarchy/literal-key precedence, malformed contexts, source-order overrides, and config values that try to introduce extra declarations. The container cases (14 legacy cases) are represented in [containers.rs](containers.rs), including viewport caps, scoped queries, dynamic padding with optional minimums, and adjacent output compaction. The font-family cases (9 legacy cases) are covered in [typography.rs](typography.rs), including family paths, responsive sizes, modifiers, and explicit query behavior.

Expected CSS follows the agreed in-place expansion and native nesting semantics. This is a source-case audit, not a claim of byte-for-byte equivalence with old globally packed output. Color queries now use the same query construction as other directives: a contiguous named collection is one range. Named breakpoint ranges now use an inclusive lower bound and exclusive next-breakpoint upper bound (`width < 740px`), closing legacy fractional-width gaps. Migration reports affected upper boundaries once at their first use. Explicit pixel arrow ranges and authored standard media queries keep their original endpoints. Media compaction retains the exact conditions it receives.

## Intentional behavior choices

- `@iterate` and `@unpack` expand in place. The old implementations appended output to the parent; migration analysis must report meaningful cascade changes.
- Iteration replaces every complete `$key` / `$value` occurrence, including selectors. The old plugin replaced only the first occurrence in each declaration/parameter and did not substitute selectors. Comments and escaped placeholders remain literal. Strings escape inserted quotes, backslashes, and newlines. A nested iterator shadows the outer bindings within its body; its path can use the outer key. Substitution cannot introduce additional rules or declarations.
- `@abs100` inherits a surrounding responsive query without generating a duplicate nested media block. Explicit child queries remain errors.
- `@embed-responsive` retains its pseudo-element and absolutely positioned media children. Changing it to `aspect-ratio` would be a separate semantic decision.
- Unpacked rules remain inside their enclosing layers, supports, selectors, and responsive scopes. No global media sorting or merging is added.
- Design pixels retain five-decimal viewport conversion and `var(--ec-zoom)`. The largest breakpoint is selected by numeric width; its matching container maximum is used. Invalid reference widths and relative viewport/percentage maximums fail explicitly.

## Column audit

[sizing.rs](sizing.rs) represents the 17 legacy column cases and the three column-offset alias cases with grouped assertions: fractions, numerator/denominator gutter modifiers, viewport caps, the 0.002vw maximum-width adjustment, native calculations, nested selectors, responsive scopes, sequential overrides, and errors. Negative fractions retain the legacy signed-column formula: with a 20px gutter, `-1/4` becomes `calc(-25% - 25px)`. Negating a named spacing token still negates its whole resolved value.

## Spacing audit

[spacing.rs](spacing.rs) extends the shared sizing tests with the legacy spacing suite's combinations of named/wildcard/hierarchical values, negative values, gutter multipliers, shortcuts, importance, query lists/collections, child selectors, `negate()`, `breakout`, container/calculation references, design pixels, viewport caps, fluid sizes, and vertical rhythm. Reference-width precedence and dynamic containers are also covered in [unpack.rs](unpack.rs), [sizing.rs](sizing.rs), and [containers.rs](containers.rs). Equal and partially equal breakpoint values are covered in [optimization.rs](optimization.rs). Expected native CSS preserves source order; adjacent media compaction compares expressions before Lightning simplifies their arithmetic, so algebraically equal expressions may remain separate blocks.

## Typography audit

[typography.rs](typography.rs) covers the font-size suite's scalar/object/wildcard combinations, line-height suffixes, modifiers, hierarchical and literal slash keys, viewport/design-pixel conversion and caps, reference-width precedence, fluid sizing, shared `__base__` properties, responsive scopes, and later overrides. Legacy callback fixtures are expressed as typed JSON5 references: `{typography.families.brand.regular}` can supply an array or string, and `{colors.ink}` can be mixed with static properties. No JavaScript executes. Missing references fail config resolution; unsupported property arrays and malformed styles fail at the directive. The large legacy mixed-layout example is represented by focused nesting and directive-interaction cases, rather than copied globally reordered CSS snapshots.

## Next feature families

1. The spacing/font-size source-case audit is complete: [legacy_sizing.rs](legacy_sizing.rs) runs all 86 spacing and 52 font-size cases from [static fixtures](fixtures/legacy-sizing.json), without Node. Every case includes its old title, input/config and reviewed standard-CSS expectation or diagnostic. Intentional changes have per-case notes: authored order, exact media ranges, fluid formulas, object line-height overrides, `system-ui` backend fallbacks, and strict rejection of undefined font tokens. Six callback fixtures use static data/token references. One old mixed-layout success case deliberately becomes an error because its expected CSS contained undefined font names; focused valid mixed-layout coverage remains in [typography.rs](typography.rs). The existing focused/table-driven suites add malformed input and interaction coverage. This is not a claim that the legacy output is unchanged.
2. Value functions are now covered in [functions.rs](functions.rs): the three legacy function cases, every easing table entry, lazy/nested fallbacks, scalar arrays, literal exclusions, cycle detection, and source locations.
3. Bundled `@europa` styles are covered in [bundles.rs](bundles.rs): both legacy bundle cases, config overrides, conditional scope, directive ordering, embedded asset consistency, and diagnostics at the authored directive.
4. Import resolution and dependency tracking are covered in [imports.rs](imports.rs) and [cli.rs](cli.rs): repeated/nested imports, import conditions and layers, escaped keywords and adjacent CSS token boundaries, escaping/BOMs, URL rebasing, per-file frontend/backend diagnostics and maps, remote import ordering, cycles/limits, and protecting source dependencies from output writes. These are native Rust cases; package/glob resolution and namespaces remain unsupported.
5. [responsive.rs](responsive.rs) adds query forms, the `@mq` alias, root/sibling ordering, nested intersections, responsive sizes, unpack/placeholder interactions, and malformed queries. Continue the remaining rule audit, migration diagnostics, and watch/build integration.

Structural parser checks in [parser.rs](parser.rs), [backend.rs](backend.rs), and [imports.rs](imports.rs) distinguish [CSS URL tokens](https://drafts.csswg.org/css-syntax-3/#consume-url-token) from ordinary function blocks. Braces, brackets, semicolons, and comment-looking text inside unquoted URLs remain payload; escaped/case-insensitive `url` names are recognized. URL payloads are excluded from value rewriting, and malformed unquoted URLs fail with an authored location. This is focused syntax coverage, not a claim of complete CSS Syntax conformance or browser-style error recovery.

Migration checks in [migration.rs](migration.rs) and [cli.rs](cli.rs) cover the explicit legacy version, selector-aware specificity differences and quiet cases, multi-level/generated selectors, pseudo-element matching risks, local shorthand/importance/order conflicts, bounded suffix fixes, stale/overlapping edits, imported source locations, read-only JSON reports, selective file edits, idempotence, and nonzero status when review remains. They do not certify the full cascade or rendered appearance.

Reviewed semantic findings can be accepted only against the same complete source/config snapshot. Migration tests also check partial acceptance, stale imports/configuration, changed finding identities, and rejection of accepted syntax errors or incomplete analysis. A saved report without explicit decisions accepts nothing.

Watch integration tests run the standalone binary with an empty `PATH`. They check config/import edits, retained CSS/maps on syntax errors, missing/deleted import recovery, editor file replacement, changing dependency graphs, and absence of output-triggered rebuild loops. Import snapshot tests cover restored timestamps and symlink retargets.

Sizing corrections (the first, second, and object-modifier checks below are included in migration analysis):

- `between()` uses the same viewport interval for its lower endpoint and slope. In the smallest breakpoint, spacing previously substituted 320px after calculating the slope from zero, while typography already used 320px in the slope. The shared formula follows typography and requires a positive interval. Fluid endpoints must use matching px or rem units.
- `vertical-rhythm()` multiplies the entire resolved font size by the line-height factor. The old scalar-fluid path removed the outer `calc()` and multiplied only the final term: at the lower viewport endpoint, `between(18px-22px)` with line height 1.6 produced 18px instead of 28.8px. Migration analysis flags additive scalar calculations, including fluid rhythm reached through config tokens. Identity line-height factors and multiplication-only expressions stay quiet. Object-based and scalar font sizes now use the same grouping.
- An overflowing column fraction or nonpositive denominator is an error. Negative column counts and gutter adjustments remain supported. The previous overflow check could be bypassed by its surrounding condition.
- Multiplying an object-based typography style retains its other properties; only font size is multiplied. Conversions still apply after multiplication, including design pixels and viewport maximums.
- `var[...]` replacements stay grouped inside calculations, including negative/subtracted expressions and nested native math. Strings, comments, URL payloads, and custom-property names are excluded from dimension rewriting.

Run `cargo test --locked -p europacss`; run `cargo clippy --locked -p europacss --all-targets -- -D warnings` and `cargo fmt --all -- --check` before committing.

## Render-driven edge cases

The live-site comparison added repeated-selector media-order, overlapping-width,
and equal-value grouping cases to [migration.rs](migration.rs). These warnings
are conservative review prompts, not a complete cascade simulator. The report
version is now 5, so previous acceptance files must be regenerated and reviewed.
See the [rendered comparison](../../../research/parser-feasibility/rendered-comparison.md)
for the original and manually migrated site observations.

[spacing.rs](spacing.rs) also checks reusable `negate()` values, retained two-argument
gap shorthand, negative column migration guidance, nonnumeric arguments, gutter
reference cycles through fractions and calculations, and finite arithmetic limits.
Recursive gutter resolution now retains the expression-depth budget instead of
restarting it through `css()`; overflow/cycles fail at the authored directive.

## Reviewed appearance proposals

Migration tests now cover opt-in adjacent fallback reordering, stale/forged review
rejection, ignored untrusted replacement payloads, generated-body exclusions and
CLI reanalysis with an empty PATH. Object line-height suffixes that the legacy
unmodified-object path ignored now produce a resolved migration warning.

The Site B audit adds zero-argument constant theme resolver conversion (without JS
evaluation), comma-separated placeholder extension order, invalid lists and cycles.
