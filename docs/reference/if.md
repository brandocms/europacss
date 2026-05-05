# @if

Conditionally includes a block of CSS based on a config value being truthy.

## Syntax

```css
@if {configPath} {
  /* declarations */
}
```

## Usage

```js
// Config
typography: {
  optimizeLegibility: true
}
```

```css
@if theme.typography.optimizeLegibility {
  body {
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```

If `theme.typography.optimizeLegibility` is truthy, the block is included. Otherwise it's removed entirely from the output.

## Examples

```css
@if theme.features.darkMode {
  :root {
    color-scheme: light dark;
  }
}

@if theme.layout.stickyHeader {
  header {
    position: sticky;
    top: 0;
    z-index: 100;
  }
}
```
