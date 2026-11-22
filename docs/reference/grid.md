# @grid

`@grid` sets `display: grid`, takes its track count from `theme.columns.count`, and sets `column-gap` from `theme.columns.gutters`. Each track uses `minmax(0, 1fr)` so wide content can fit inside equal-width columns.

```json5
columns: {
  count: { $sm: 4, $lg: 11 },
  gutters: { $sm: '12px', $lg: '16px' },
}
```

```css
.page { @grid; }
.media-row {
  grid-column: 1 / -1;
  @grid subgrid;
}
```

At a breakpoint in `$lg`, the page gets `repeat(11, minmax(0, 1fr))` and a 16px column gap. A missing count falls back to 12. The bundled theme supplies its own counts.

`@grid subgrid` sets `display: grid` and `grid-template-columns: subgrid`. The child shares its parent’s column tracks. Either directive can be used inside `@responsive`.
