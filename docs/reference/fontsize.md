# @fontsize

Applies responsive font sizes from your config, with optional line-height override.

## Syntax

```css
@fontsize {sizeQuery}[/lineHeight] [breakpointQuery];
```

## Basic Usage

References a named size from `theme.typography.sizes`:

```css
/* Outputs font-size for each breakpoint */
@fontsize xl;
@fontsize base;
@fontsize sm;
```

## With Line-Height

Append `/lineHeight` to override the line-height:

```css
@fontsize xl/2.0;
@fontsize base/1.6;
@fontsize sm/1.5;
```

## Multipliers

Scale a size value with parentheses:

```css
/* 80% of the xl size */
@fontsize xl(0.8);

/* With line-height */
@fontsize xl(0.8)/2.1;
```

## Hierarchical Keys

Use slash notation for nested size definitions:

```css
/* Config: sizes['header/large'] = { xs: '32px', ... } */
@fontsize header/large;
@fontsize body/small;

/* With line-height (appended after the key) */
@fontsize body/small/1.5;
```

## Between (Fluid Scaling)

Linearly interpolate font-size between two values:

```css
@fontsize between(18px-22px);
@fontsize between(14px-18px);
```

## Breakpoint Constraints

Limit output to specific breakpoints:

```css
/* Only at xs */
@fontsize sm xs;

/* At md and above */
@fontsize lg >=md;

/* Above md */
@fontsize lg >md;
```

## Multi-Property Sizes

When your config defines sizes as objects with multiple properties:

```js
// Config
sizes: {
  h1: {
    xs: { 'font-size': '32px', 'line-height': '120%', 'letter-spacing': '-0.02em' },
    md: { 'font-size': '56px', 'line-height': '110%', 'letter-spacing': '-0.03em' }
  }
}
```

```css
/* Outputs all properties per breakpoint */
@fontsize h1;
```

## `__base__` Properties

Sizes with a `__base__` key output shared properties outside media queries:

```js
// Config
sizes: {
  'body-large': {
    __base__: {
      'line-height': '135%',
      'letter-spacing': '-0.02em'
    },
    xs: { 'font-size': '20px' },
    sm: { 'font-size': '25px' },
    md: { 'font-size': '30px' }
  }
}
```

```css
/* Input */
h2 {
  @fontsize body-large;
}

/* Output */
h2 {
  line-height: 135%;
  letter-spacing: -0.02em;
}
@media (width <= 739px) {
  h2 { font-size: 20px; }
}
@media (min-width: 740px) and (max-width: 1023px) {
  h2 { font-size: 25px; }
}
@media (width >= 1024px) {
  h2 { font-size: 30px; }
}
```

## Dynamic Font Family in `__base__`

Reference other config values via function:

```js
sizes: {
  'heading': {
    __base__: {
      'font-family': theme => theme.typography.families['header/display']
    },
    xs: { 'font-size': '24px' },
    md: { 'font-size': '36px' }
  }
}
```

## Examples

### Typical heading

```css
h1 {
  @font header/display;
  @fontsize xl;
}
```

### Body text with line-height

```css
p {
  @font body/regular;
  @fontsize base/1.6;
}
```

### Responsive override

```css
.caption {
  @fontsize sm;

  @responsive >=md {
    @fontsize xs;
  }
}
```
