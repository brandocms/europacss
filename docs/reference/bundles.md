# Bundles and layout helpers

## Base stylesheet

```css
@europa base;
```

The executable embeds normalize.css and Europa's base stylesheet. It supplies reset/utility styles, root breakpoint variables, `--grid-gutter`, `--container-padding` and `--ec-zoom: 1`.

The base bundle reads `typography.base`, the `main` and `mono` font families, container values, and column counts/gutters. If you replace those theme sections, supply the entries it needs; the [complete starter config](../guide/getting-started#create-a-project-configuration) does this.

Bundles expand at their authored position and retain enclosing conditions. Put local `@import` statements first and the base bundle before component rules. A migration check reports legacy bundle placements that relied on root hoisting.

## Arrow stylesheet

```css
@europa base;
@europa arrows;
```

This includes Europa's embedded arrow styles. Both bundles compile with your config through the same native pipeline as authored CSS. No package-file import or Node runtime is required.

## Fill an absolutely positioned box

```css
.media { position: relative; }
.media-overlay { @abs100; }
```

`@abs100` sets `position: absolute`, `width: 100%`, `height: 100%`, `top: 0` and `left: 0`. `@abs100!` marks these declarations important; either form accepts an optional breakpoint query.

```css
.media-overlay { @abs100 >=sm; }
```

For ratio-based media wrappers, see [@embed-responsive](./embed-responsive).
