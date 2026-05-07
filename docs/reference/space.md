# @space

Applies responsive spacing values from your config, generating media queries for each breakpoint.

## Syntax

```css
@space {property} {sizeQuery} [breakpointQuery];
```

Use `@space!` for `!important` output.

## Properties

Any CSS property works, plus these shorthand helpers:

| Property | Output |
|----------|--------|
| `margin-x` | `margin-left` + `margin-right` |
| `margin-y` | `margin-top` + `margin-bottom` |
| `padding-x` | `padding-left` + `padding-right` |
| `padding-y` | `padding-top` + `padding-bottom` |
| `translateX` | `transform: translateX(...)` |
| `translateY` | `transform: translateY(...)` |
| `translateZ` | `transform: translateZ(...)` |
| `scale` | `transform: scale(...)` |

## Special Properties

### container

Full responsive container setup — padding, max-width, centering:

```css
.wrapper {
  @space container;
}
```

Outputs per breakpoint:
- `padding-left` / `padding-right` (from `container.padding`)
- `max-width` (from `container.maxWidth`)
- `margin-left: auto` / `margin-right: auto`
- `width: 100%`

Target specific breakpoints:

```css
@space container xs/sm;
```

### breakout

Break out of a container to full viewport width:

```css
.full-bleed {
  @space breakout;
}
```

Outputs:
```css
width: 100vw;
margin-left: calc(50% - 50vw);
```

With breakpoint:

```css
@space breakout $mobile;
```

## Named Sizes

Reference spacing values from your config:

```css
/* Config: spacing.md = { xs: '35px', sm: '45px', md: '55px' } */

@space margin-y md;
@space padding-x sm;
@space gap block;
```

### Nested Spacing Keys

Access nested spacing with dot or slash notation:

```css
/* Config: spacing.block.sm = { mobile: '10px', tablet: '20px', desktop: '30px' } */

@space margin-top block/sm;
@space margin-top block.sm;  /* equivalent */
```

## Container as Size

Use the container padding value on any property (without the full container behavior):

```css
/* Just the padding values, no max-width */
@space padding-x container;
@space padding-bottom container;

/* Half the container padding */
@space padding-right container/2;
```

## Negative Values

Prefix with `-` for negative values:

```css
@space margin-top -block;
@space margin-left -container;
@space margin-right -container/2;
```

## Multipliers

Divide a spacing value:

```css
/* Half of the xs spacing value */
@space padding xs/2;

/* Third of container padding */
@space margin-left container/3;
```

## Column Widths

Size elements as a fraction of the grid, accounting for column gutters from `theme.columns.gutters`:

```css
/* 6 of 12 columns — outputs calc(50% - {half gutter}) */
@space width 6/12;

/* 4 of 12 columns */
@space width 4/12;

/* Works on any property */
@space margin-top 6/12 mobile;
```

### Gutter Multiplier

Adjust the gutter offset using the `columns:gutterMultiplier/totalColumns` syntax:

```css
/* 6 of 12 columns, subtract 1 extra gutter unit */
@space width 6:1/12;
```

## Between (Fluid Scaling)

Linearly interpolate between two values across the viewport:

```css
@space padding between(20px-50px);
@space margin-y between(30px-100px);
```

## Design Pixels (dpx)

Scale values relative to a reference viewport width (configured via `dpxViewportSize`):

```css
@space padding 40dpx;
@space margin-top 25dpx;
@space gap 16dpx;
```

A `40dpx` value with a reference viewport of 1440px computes to a proportional `vw` value.

## Calc with Variable References

Use `var[name]` inside calc expressions to reference config values:

```css
/* Reference spacing values */
@space width calc(100vw - var[container]);
@space margin-left calc(var[md] + var[xs]);
@space translateX calc(100vw - var[container] + var[1]);

/* Reference column gutters */
@space width calc(100% - var[1]);
```

`var[container]` resolves to the container padding value. `var[1]` resolves to 1 column gutter unit.

## Vertical Rhythm

Calculate spacing based on font size line-height:

```css
@space margin-top vertical-rhythm(theme.typography.sizes.xl);
@space margin-bottom vertical-rhythm(theme.typography.sizes.xl, 1.2);
```

## Negate

Outputs a negative `margin-top` that cancels one spacing value and replaces it with another. Useful when a parent sets a gap or margin you need to override on specific children.

**Syntax:** `@space negate({spacingToCancel}, {desiredGap}) [breakpointQuery]`

Outputs: `margin-top: calc(-{spacingToCancel} + {desiredGap})` per breakpoint.

### Fixed desired gap

```css
/* Cancel the 'block' spacing, replace with 25px */
@space negate(block, 25px);
```

Given `block = { xs: '20px', sm: '30px', md: '40px' }`, outputs:

```css
@media (width <= 739px)  { margin-top: calc(-20px + 25px); }
@media (...tablet...)    { margin-top: calc(-30px + 25px); }
@media (width >= 1024px) { margin-top: calc(-40px + 25px); }
```

### Named spacing as desired gap

```css
/* Cancel 'block', replace with 'xs' spacing */
@space negate(block, xs);
```

### Addition/subtraction expressions

```css
/* Cancel 'block', replace with block + xs */
@space negate(block, block+xs);

/* Cancel 'block', replace with block - 2vw */
@space negate(block, block-2vw);
```

### With breakpoint

```css
@space negate(block, 25px) desktop;
@space negate(block, 25px) >=tablet;
@space negate(block, 25px) $test;
```

### With !important

```css
@space! negate(block, 25px) desktop;
```

## Breakpoint Constraints

Limit output to specific breakpoints:

```css
/* Only at xs breakpoint */
@space margin-top xl xs;

/* Only for $mobile collection */
@space padding sm $mobile;

/* Only at the 'large' breakpoint */
@space padding-left container large;

/* Multiple breakpoints */
@space margin-y md xs/sm;
```

## Important Flag

Use `@space!` for `!important`:

```css
@space! margin-left xs;
@space! padding-top 0 $lg;
@space! margin-top calc(var[block] * -1) $lg;
```

## Examples

### Section spacing

```css
.section {
  @space container;
  @space padding-y xl;
}
```

### Negative margin bleed

```css
.bleed {
  @space margin-left -container;
  @space margin-right -container;
  @space padding-x container;
}
```

### Responsive gap

```css
.grid {
  @display flex/row/wrap;
  @space gap sm;
}
```
