# @display

Shorthand for setting up flexbox display with direction and wrap.

## Syntax

```css
@display {type}[/{direction}][/{wrap}] [breakpointQuery];
```

## Usage

```css
/* display: flex */
@display flex;

/* display: flex; flex-direction: row */
@display flex/row;

/* display: flex; flex-direction: row; flex-wrap: wrap */
@display flex/row/wrap;

/* display: flex; flex-direction: column */
@display flex/column;

/* display: flex; flex-direction: column; flex-wrap: wrap */
@display flex/column/wrap;
```

## With Breakpoint

```css
.layout {
  @display flex/column;
  @display flex/row $desktop;
}

.grid {
  @display flex/row/wrap;
  @display flex/column $mobile;
}
```

## Output

```css
/* Input */
.card {
  @display flex/row/wrap;
}

/* Output */
.card {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
}
```

```css
/* Input */
.stack {
  @display flex/column $mobile;
}

/* Output */
@media (width <= 739px) {
  .stack {
    display: flex;
    flex-direction: column;
  }
}
```
