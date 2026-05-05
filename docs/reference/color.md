# @color

Applies colors from your config to various CSS properties.

## Syntax

```css
@color {target} {colorPath} [breakpointQuery];
```

Use `@color!` for `!important` output.

## Targets

| Target | CSS Property |
|--------|-------------|
| `fg` | `color` |
| `bg` | `background-color` |
| `fill` | `fill` |
| `stroke` | `stroke` |
| `border` | `border-color` |
| `border-top` | `border-top-color` |
| `border-bottom` | `border-bottom-color` |
| `border-left` | `border-left-color` |
| `border-right` | `border-right-color` |

## Basic Usage

```css
h1 {
  @color fg black;
}

.card {
  @color bg white;
  @color border primary;
}
```

## Nested Color Paths

Access nested colors with dot notation:

```css
/* Config: colors.headings.h1 = '#1a1a1a' */
h1 {
  @color fg headings.h1;
}

/* Config: colors.button.primary = '#3ecf8e' */
.btn {
  @color bg button.primary;
}
```

## Direct Values

Use hex colors or CSS keywords directly:

```css
.overlay {
  @color bg #000000;
  @color fg #ffffff;
}

.hidden {
  @color bg transparent;
}
```

## With Breakpoint

Apply colors conditionally per breakpoint:

```css
.nav-link {
  @color fg white $mobile;
  @color fg black $desktop;
}
```

## Important Flag

```css
.override {
  @color! fg red;
  @color! bg transparent;
}
```

## Config Format

```js
colors: {
  // Flat
  black: '#000',
  white: '#fff',
  transparent: 'transparent',
  primary: '#3ecf8e',

  // Nested (accessed via dot notation)
  headings: {
    h1: '#1a1a1a',
    h2: '#333333'
  },
  button: {
    primary: '#3ecf8e',
    hover: '#2da36e',
    text: '#ffffff'
  }
}
```
