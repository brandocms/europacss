# @unpack

Unpacks a responsive config object into media queries with CSS declarations.

## Syntax

```css
@unpack {configPath | shortcut};
```

## Shortcuts

| Shortcut | Source | Generated custom property |
| --- | --- | --- |
| `containerPadding` | `theme.container.padding` | `--container-padding` |
| `gridGutter` | `theme.columns.gutters` | `--grid-gutter` |

## Usage

### Built-in Shortcuts

```css
.element {
  @unpack containerPadding;
}
```

Outputs `--container-padding` for each configured query. It does not set padding by itself. Use `@space padding-x container;` for horizontal padding, or consume `var(--container-padding)` in authored CSS. The `gridGutter` shortcut similarly outputs `--grid-gutter`.

### Custom Paths

Given a config like:

```json5
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

Outputs each breakpoint's properties inside the corresponding media query. Custom property bags contain ordinary CSS values; Europa sizing expressions such as `dpx` and `var[...]` are not evaluated inside these bags:

```css
@media (width < 740px) {
  .nav-link {
    font-size: 14px;
    line-height: 1.4;
    letter-spacing: 0.05em;
  }
}
@media (width >= 740px) and (width < 1024px) {
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

```json5
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
