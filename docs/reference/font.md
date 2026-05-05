# @font

Applies a font-family from your config, with optional font size.

## Syntax

```css
@font {familyKey} [fontSizeKey];
```

## Basic Usage

```css
/* Config: families.main = ['Inter', 'sans-serif'] */
body {
  @font main;
}

/* Output */
body {
  font-family: Inter, sans-serif;
}
```

## Hierarchical Keys

Use slash notation for nested family definitions:

```css
/* Config: families['header/display'] = ['Playfair Display', 'serif'] */
h1 {
  @font header/display;
}

/* Config: families.body.regular = ['Inter', 'sans-serif'] */
p {
  @font body/regular;
}
```

## With Font Size

Combine font family and size in one rule:

```css
/* Applies family AND responsive font-size */
h1 {
  @font header/display xl;
}
```

This is equivalent to:

```css
h1 {
  @font header/display;
  @fontsize xl;
}
```

## Config Formats

Font families can be defined in multiple ways:

```js
families: {
  // Array (recommended)
  main: ['Inter', 'Helvetica', 'sans-serif'],

  // Slash notation
  'body/regular': ['Inter', 'sans-serif'],
  'body/bold': ['Inter-Bold', 'sans-serif'],
  'header/display': ['Playfair Display', 'serif'],

  // Nested objects (equivalent to slash notation)
  body: {
    regular: ['Inter', 'sans-serif'],
    bold: ['Inter-Bold', 'sans-serif']
  },
  header: {
    display: ['Playfair Display', 'serif']
  }
}
```
