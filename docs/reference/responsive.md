# @responsive

Creates media queries using your configured breakpoints.

**Alias:** `@mq`

## Syntax

```css
@responsive {breakpointQuery} {
  /* declarations */
}
```

## Single Breakpoint

Targets one specific breakpoint range:

```css
@responsive xs {
  .hero { padding: 20px; }
}

@responsive md {
  .hero { padding: 60px; }
}
```

## Comparison Operators

Target ranges using `>=`, `<=`, `>`, `<`:

```css
/* md and above */
@responsive >=md {
  .sidebar { display: block; }
}

/* Below md */
@responsive <md {
  .sidebar { display: none; }
}

/* sm and below */
@responsive <=sm {
  .nav { flex-direction: column; }
}
```

## Multiple Breakpoints

Target specific breakpoints with `/` separator:

```css
@responsive xs/sm {
  .card { flex-direction: column; }
}

@responsive md/lg/xl {
  .card { flex-direction: row; }
}
```

## Breakpoint Collections

Use `$`-prefixed collection names from your config:

```css
/* Config: breakpointCollections: { $mobile: 'xs', $desktop: 'md/lg/xl' } */

@responsive $mobile {
  .menu { position: fixed; }
}

@responsive $desktop {
  .menu { position: static; }
}
```

## Custom Pixel Ranges

Define arbitrary ranges with the `->` syntax:

```css
/* Between 359px and 740px */
@mq 359px->740px {
  .element { font-size: 14px; }
}

/* 500px and above (open-ended) */
@mq 500px-> {
  .element { font-size: 16px; }
}

/* Up to 800px */
@mq ->800px {
  .element { font-size: 12px; }
}
```

## Nesting

`@responsive` blocks can be nested inside selectors:

```css
.card {
  padding: 20px;

  @responsive >=md {
    padding: 40px;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}
```

## Output

Given breakpoints `{ xs: '0', sm: '740px', md: '1024px' }`:

```css
/* Input */
@responsive sm {
  .box { padding: 30px; }
}

/* Output */
@media (min-width: 740px) and (max-width: 1023px) {
  .box { padding: 30px; }
}
```

```css
/* Input */
@responsive >=sm {
  .box { padding: 30px; }
}

/* Output */
@media (width >= 740px) {
  .box { padding: 30px; }
}
```
