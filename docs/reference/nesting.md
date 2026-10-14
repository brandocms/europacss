# Nesting and reuse

Europa expands its directives and emits common rules before responsive rules within each scope. Standard selectors and nesting follow native CSS semantics, with browser-target transforms supplied by Lightning CSS. See [cascade and layers](./cascade) for the ordering policy.

## Nested selectors

```css
.card {
  @space padding md;

  .title {
    @fontsize heading;
  }

  &:hover {
    @color fg accent;
  }
}
```

Use `&` as the parent selector. Sass-style concatenation such as `&__title` is unsupported; write `.card__title` explicitly. The [migration command](../guide/lint-and-migration#apply-supported-syntax-fixes) can fix eligible legacy suffix selectors.

## Specificity and source order

For a selector-list parent, native nesting uses the most specific parent alternative:

```css
.card, #featured {
  .title { color: red; }
}
```

This has the specificity of `:is(.card, #featured) .title`, including when the element matches `.card`. That differs from expanding each parent as an independent selector. Migration checks flag relevant legacy differences.

### Expanded selector mode

Set `nesting: 'expanded'` at the top level of `europa.json5` to expand nested
rules into explicit selector lists with each branch's own specificity:

```json5
{ nesting: 'expanded', theme: { /* project tokens */ } }
```

The example above becomes `.card .title, #featured .title`. An `.a, .b` parent
with `& + &` becomes `.a + .a, .b + .b`: each branch reuses the same parent.
This is a supported semantic choice, not just output formatting. The default
`nesting: 'native'` retains native matching and specificity; target lowering can
use `:is()`. Expanded mode does not remove explicitly authored `:is()`/`:has()`
or promise faster browser matching.

Expansion retains declaration order, conditions, layers, and source locations.
It stops with `EU_NESTING_LIMIT` rather than silently changing semantics when it
exceeds 256 branches per rule, 16384 bytes per selector, 50000 branches, or 16 MiB
of emitted selector text. Nested `@scope` inside a selector requires explicit
source flattening. Suffix concatenation still needs migration.

Common declarations retain their source order:

```css
body {
  @fontsize body;
  line-height: normal;
}
```

Here the authored `line-height` overrides any common line-height declaration generated at the directive. If the token also generates a responsive line height, that media rule follows the common declarations and can override them at matching widths. Use [layers](./cascade#a-layer-convention-for-brando) for application overrides that should take precedence over a library's responsive rules.

## Placeholders

Define reusable blocks at the stylesheet root or inside unconditional `@layer`
blocks, then extend them where needed:

```css
%focus-ring {
  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 4px;
  }
}

.button {
  @extend %focus-ring;
  @space padding sm;
}
```

Forward references are supported. `@extend %one, %two;` expands placeholders in the written order at the use site. Cycles and missing placeholders fail compilation. Arbitrary selector extension is unsupported; `@extend` is for named `%placeholders`.

Definitions inside `@import './definitions.css' layer(brando)` work too.
Placeholders are global compile-time templates, including across different
layers; their contents inherit the layer and conditions at the **use site**.
Definitions emit no rules, and duplicate names are errors. Definitions inside
selectors or conditional groups remain unsupported because hoisting them would
silently discard those conditions.
