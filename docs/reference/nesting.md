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

Common declarations retain their source order:

```css
body {
  @fontsize body;
  line-height: normal;
}
```

Here the authored `line-height` overrides any common line-height declaration generated at the directive. If the token also generates a responsive line height, that media rule follows the common declarations and can override them at matching widths. Use [layers](./cascade#a-layer-convention-for-brando) for application overrides that should take precedence over a library's responsive rules.

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
