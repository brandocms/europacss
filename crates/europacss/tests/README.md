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

[basic_rules.rs](basic_rules.rs) represents the legacy color (19 cases), display (8), order (4), and conditional (4) suites through grouped/table-driven assertions. It also covers every color target, nested native functions, hierarchy/literal-key precedence, malformed contexts, source-order overrides, and config values that try to introduce extra declarations. The font-family cases (9 legacy cases) are covered in [typography.rs](typography.rs), including family paths, responsive sizes, modifiers, and explicit query behavior.

Expected CSS follows the agreed in-place expansion and native nesting semantics. This is a source-case audit, not a claim of byte-for-byte equivalence with old globally packed output. Color queries now use the same query construction as other directives: a contiguous named collection is one range. The old color plugin emitted separate per-breakpoint ranges, leaving fractional-width gaps between integer endpoints; migration analysis should report that difference where it matters. Standalone `@responsive` already constructs contiguous ranges. Media compaction retains the exact conditions it receives.

## Intentional behavior choices

- `@iterate` and `@unpack` expand in place. The old implementations appended output to the parent; migration analysis must report meaningful cascade changes.
- Iteration replaces every complete `$key` / `$value` occurrence, including selectors. The old plugin replaced only the first occurrence in each declaration/parameter and did not substitute selectors. Comments and escaped placeholders remain literal. Strings escape inserted quotes, backslashes, and newlines. A nested iterator shadows the outer bindings within its body; its path can use the outer key. Substitution cannot introduce additional rules or declarations.
- `@abs100` inherits a surrounding responsive query without generating a duplicate nested media block. Explicit child queries remain errors.
- `@embed-responsive` retains its pseudo-element and absolutely positioned media children. Changing it to `aspect-ratio` would be a separate semantic decision.
- Unpacked rules remain inside their enclosing layers, supports, selectors, and responsive scopes. No global media sorting or merging is added.
- Design pixels retain five-decimal viewport conversion and `var(--ec-zoom)`. The largest breakpoint is selected by numeric width; its matching container maximum is used. Invalid reference widths and relative viewport/percentage maximums fail explicitly.

## Next feature families

1. Continue the systematic spacing/container/column/typography case audit. The shared size engine and grid/column helpers are now implemented; [sizing.rs](sizing.rs) and [typography.rs](typography.rs) cover representative legacy calculations, wildcard/negative/hierarchical tokens, modifiers, viewport reference precedence, nested scope, and failures. These table-driven checks do not yet represent every old case. Adjacent equivalent media bodies are compacted into exact comma-separated conditions; nonadjacent groups are not moved or packed. [optimization.rs](optimization.rs) checks ordering, conditional scopes, fractional-width gaps, and source maps.
2. Value functions are now covered in [functions.rs](functions.rs): the three legacy function cases, every easing table entry, lazy/nested fallbacks, scalar arrays, literal exclusions, cycle detection, and source locations.
3. Bundled `@europa` styles are covered in [bundles.rs](bundles.rs): both legacy bundle cases, config overrides, conditional scope, directive ordering, embedded asset consistency, and diagnostics at the authored directive.
4. Import resolution and dependency tracking are covered in [imports.rs](imports.rs) and [cli.rs](cli.rs): repeated/nested imports, import conditions and layers, escaping/BOMs, URL rebasing, per-file frontend/backend diagnostics and maps, remote import ordering, cycles/limits, and protecting source dependencies from output writes. These are native Rust cases; package/glob resolution and namespaces remain unsupported.
5. [responsive.rs](responsive.rs) adds query forms, the `@mq` alias, root/sibling ordering, nested intersections, responsive sizes, unpack/placeholder interactions, and malformed queries. Continue the remaining rule audit, migration diagnostics, and watch/build integration.

Sizing corrections to include in migration analysis:

- `between()` uses the same viewport interval for its lower endpoint and slope. In the smallest breakpoint, spacing previously substituted 320px after calculating the slope from zero, while typography already used 320px in the slope. The shared formula follows typography and requires a positive interval. Fluid endpoints must use matching px or rem units.
- An overflowing column fraction or zero denominator is an error. Negative gutter adjustments remain supported. The previous overflow check could be bypassed by its surrounding condition.
- Multiplying an object-based typography style retains its other properties; only font size is multiplied. Conversions still apply after multiplication, including design pixels and viewport maximums.
- `var[...]` replacements stay grouped inside calculations, including negative/subtracted expressions and nested native math. Strings, comments, URL payloads, and custom-property names are excluded from dimension rewriting.

Run `cargo test --locked -p europacss`; run `cargo clippy --locked -p europacss --all-targets -- -D warnings` and `cargo fmt --all -- --check` before committing.
