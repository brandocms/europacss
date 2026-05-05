# @unpack

Unpacks a responsive config object into media queries with CSS declarations.

## Syntax

```css
@unpack {configPath | shortcut};
```

## Shortcuts

| Shortcut | Equivalent Path |
|----------|----------------|
| `containerPadding` | `theme.container.padding` |
| `gridGutter` | `theme.columns.gutters` |

## Usage

### Built-in Shortcuts

```css
.element {
  @unpack containerPadding;
}
```

Outputs the container padding value as `padding-left` and `padding-right` for each breakpoint.

### Custom Paths

Given a config like:

```js
typography: {
  sections: {
    navigation: {
      xs: { 'font-size': '14px', 'line-height': '1.4', 'letter-spacing': '0.05em' },
      sm: { 'font-size': '15px', 'line-height': '1.4', 'letter-spacing': '0.05em' },
      md: { 'font-size': '16px', 'line-height': '1.5', 'letter-spacing': '0.04em' }
    }
  }
}
```

```css
.nav-link {
  @unpack theme.typography.sections.navigation;
}
```

Outputs each breakpoint's properties inside the corresponding media query:

```css
@media (width <= 739px) {
  .nav-link {
    font-size: 14px;
    line-height: 1.4;
    letter-spacing: 0.05em;
  }
}
@media (min-width: 740px) and (max-width: 1023px) {
  .nav-link {
    font-size: 15px;
    line-height: 1.4;
    letter-spacing: 0.05em;
  }
}
@media (width >= 1024px) {
  .nav-link {
    font-size: 16px;
    line-height: 1.5;
    letter-spacing: 0.04em;
  }
}
```

## Header Padding Example

```js
// Config
header: {
  padding: {
    large: {
      xs: { 'padding-top': '15px', 'padding-bottom': '15px' },
      md: { 'padding-top': '30px', 'padding-bottom': '30px' }
    }
  }
}
```

```css
header {
  @unpack theme.header.padding.large;
}
```
