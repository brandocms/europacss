# @iterate

Loops through a config object or array, generating CSS for each entry. Array keys are zero-based indices. Use `@iterate` inside a style rule.

## Syntax

```css
.selector {
  @iterate {configPath} {
    /* use $key and $value */
  }
}
```

## Variables

Inside the loop body:
- `$key` — the current object key
- `$value` — the current value

## Usage

```json5
// Config
spacing: {
  xs: { xs: '10px', sm: '15px', md: '15px' },
  sm: { xs: '20px', sm: '25px', md: '30px' },
  md: { xs: '35px', sm: '45px', md: '55px' }
}
```

```css
.stack {
  display: flex;
  flex-direction: column;
  @iterate theme.spacing {
    &.gap-$key {
      @space gap $key;
    }
  }
}
```

## With @responsive

```css
.spacer {
  /* Loop over the breakpoint/value entries of one token. */
  @iterate theme.spacing.md {
    @responsive $key {
      margin: $value;
    }
  }
}
```

## Examples

### Generate color variants

```css
.palette {
  @iterate theme.colors {
    &.text-$key {
      color: $value;
    }
    &.bg-$key {
      background-color: $value;
    }
  }
}
```
