# @grid

Creates a CSS Grid with a 12-track template and the configured column gutter.

## Syntax

```css
.container {
  @grid;
}
```

The current implementation emits `display: grid`, `grid-template-columns: repeat(12, 1fr)` and a responsive `grid-column-gap` from one gutter unit. Browser transforms may print that last property as `column-gap`. It does not set the row gap or use `theme.columns.count` to change the number of tracks.

## Choose your own tracks

Override the template after the directive:

```css
.cards {
  @grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  @space row-gap md;

  @responsive xs {
    grid-template-columns: 1fr;
  }
}
```

Alternatively, write the grid properties directly and use Europa only for the spacing:

```css
.cards {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  @space gap 1; /* One configured gutter in both directions. */
}
```

`@grid` takes no arguments. Put it inside `@responsive` to constrain its output. For flex-based fractions with gutter arithmetic, use [@column](./column).
