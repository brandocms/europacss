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

## Intentional behavior choices

- `@iterate` and `@unpack` expand in place. The old implementations appended output to the parent; migration analysis must report meaningful cascade changes.
- Iteration replaces every complete `$key` / `$value` occurrence, including selectors. The old plugin replaced only the first occurrence in each declaration/parameter and did not substitute selectors. Comments and escaped placeholders remain literal. Strings escape inserted quotes, backslashes, and newlines. A nested iterator shadows the outer bindings within its body; its path can use the outer key. Substitution cannot introduce additional rules or declarations.
- `@abs100` inherits a surrounding responsive query without generating a duplicate nested media block. Explicit child queries remain errors.
- `@embed-responsive` retains its pseudo-element and absolutely positioned media children. Changing it to `aspect-ratio` would be a separate semantic decision.
- Unpacked rules remain inside their enclosing layers, supports, selectors, and responsive scopes. No global media sorting or merging is added.
- Design pixels retain five-decimal viewport conversion and `var(--ec-zoom)`. The largest breakpoint is selected by numeric width; its matching container maximum is used. Invalid reference widths and relative viewport/percentage maximums fail explicitly.

## Next feature families

1. Shared size-expression parsing: integrate the design-pixel primitive into spacing and typography, then gutter multipliers, fractions, container values, `var[...]`, and calculations. Use the existing space/container/column cases as the specification.
2. Typography queries and wildcard expansion, including responsive base properties and scoped overrides.
3. Grid/column helpers and remaining shortcuts, reusing the size engine. Keep deprecated `@row` as a migration diagnostic.
4. CSS value functions (`theme`, `ease`) with token-aware parsing and diagnostics.
5. Import resolution and dependency tracking with source provenance across files, then bundled `@europa` styles and watch mode.

Run `cargo test --locked -p europacss`; run `cargo clippy --locked -p europacss --all-targets -- -D warnings` and `cargo fmt --all -- --check` before committing.
