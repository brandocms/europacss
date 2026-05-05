# @column

Sets flex-based column widths.

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
  @space gap sm;
}

.grid__item {
  @column 12/12 xs;
  @column 6/12 sm;
  @column 4/12 md;
}
```
