# @grid

Sets up a CSS Grid layout using your configured column counts and gutters.

## Syntax

```css
@grid;
```

## Usage

```css
.container {
  @grid;
}
```

## Output

Based on your `theme.columns` config:

```js
columns: {
  count: { xs: 2, sm: 4, md: 12 },
  gutters: { xs: '20px', sm: '30px', md: '50px' }
}
```

Outputs per breakpoint:

```css
@media (width <= 739px) {
  .container {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 20px;
  }
}
@media (min-width: 740px) and (max-width: 1023px) {
  .container {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 30px;
  }
}
@media (width >= 1024px) {
  .container {
    display: grid;
    grid-template-columns: repeat(12, 1fr);
    gap: 50px;
  }
}
```
