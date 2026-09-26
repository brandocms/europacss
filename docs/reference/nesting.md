# Nesting and reuse

Europa expands its directives in place. Standard selectors and nesting then follow native CSS semantics, with browser-target transforms supplied by Lightning CSS.

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

Later declarations remain later:

```css
body {
  @fontsize body;
  line-height: normal;
}
```

Here the authored `line-height` can override the token's generated line height. Rules are not globally rearranged to reproduce the old PostCSS packing order.

## Placeholders

Define reusable blocks at the stylesheet root, then extend them where needed:

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
