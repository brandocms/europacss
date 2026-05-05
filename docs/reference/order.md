# @order

Sets the flexbox `order` property, optionally per breakpoint.

## Syntax

```css
@order {number} [breakpointQuery];
```

## Usage

```css
.sidebar {
  @order 2;
  @order 1 $desktop;
}

.main {
  @order 1;
  @order 2 $desktop;
}
```

## Negative Order

```css
.priority {
  @order -1;
}
```

## With Breakpoint

```css
.item {
  @order 3 xs;
  @order 1 md;
}
```
