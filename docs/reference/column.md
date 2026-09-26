# @column

Sets `position: relative`, `flex-grow: 0`, `flex-shrink: 0`, `flex-basis` and `max-width` from a gutter-adjusted fraction. The written denominator determines the fraction; `columns.count` is not used.

## Syntax

```css
@column {numerator}/{denominator} [breakpointQuery];
```

## Basic Usage

```css
.sidebar {
  @column 4/12;
}

.main {
  @column 8/12;
}
```

## Responsive Columns

```css
.card {
  @column 12/12 xs;   /* Full width on mobile */
  @column 6/12 sm;    /* Half width on tablet */
  @column 4/12 md;    /* Third width on desktop */
}
```

## Simple Fractions

```css
.half {
  @column 1/2;
}

.third {
  @column 1/3;
}

.two-thirds {
  @column 2/3;
}
```

## With Calc Variables

```css
@column calc(var[6/12]);
```

## Example: Grid Layout

```css
.grid {
  @display flex/row/wrap;
  @space gap 1; /* One configured column gutter */
}

.grid__item {
  @column 12/12 xs;
  @column 6/12 sm;
  @column 4/12 md;
}
```


## Column offsets

`@column-offset` applies the same sizing expressions to `margin-left`:

```css
.shifted { @column-offset 1:1/4; }
.overlap { @column-offset negate(1/4); }
```

`1:1/4` adds one gutter to the usual quarter-column width. A bare negative fraction such as `-1/4` applies the sign to the column count and retains the legacy gutter formula. It does not mean the same thing as `negate(1/4)`. See the [worked offsets](./space#reusable-negation) and [migration warnings](../guide/lint-and-migration).

When a resolved column contains `vw`, the compiler retains the established `0.002vw` subtraction on `max-width` to avoid rounding overflow.
