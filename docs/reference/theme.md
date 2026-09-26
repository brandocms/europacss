# theme()

Resolve a value from the theme in an ordinary CSS declaration or a Europa directive argument.

```css
.card {
  color: theme('colors.ink');
  border-color: theme('colors.optionalBorder', currentColor);
}
```

Paths start inside `theme`, so use `colors.ink`, not `theme.colors.ink`. The optional fallback is evaluated only when the path is missing. Arrays of scalar values are joined for CSS; objects are not ordinary CSS values. Missing paths without a fallback and cyclic references are errors.

`theme()` is separate from JSON5 token references: `'{colors.ink}'` aliases a value **inside the config**, while `theme('colors.ink')` inserts the resolved value **into CSS**. For breakpoint-dependent property maps, use the relevant directive such as `@space` or `@fontsize`.
