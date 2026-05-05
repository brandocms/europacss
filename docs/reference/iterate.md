# @iterate

Loops through a config object, generating CSS for each key/value pair.

## Syntax

```css
@iterate {configPath} {
  /* use $key and $value */
}
```

## Variables

Inside the loop body:
- `$key` — the current object key
- `$value` — the current value

## Usage

```js
// Config
spacing: {
  xs: { xs: '10px', sm: '15px', md: '15px' },
  sm: { xs: '20px', sm: '25px', md: '30px' },
  md: { xs: '35px', sm: '45px', md: '55px' }
}
```

```css
@iterate theme.spacing {
  .mt-$key {
    @space margin-top $key;
  }
}
```

## With @responsive

```css
@iterate theme.spacing {
  @responsive $key {
    .spacer {
      margin: $value;
    }
  }
}
```

## Examples

### Generate utility classes

```css
@iterate theme.colors {
  .text-$key {
    color: $value;
  }
  .bg-$key {
    background-color: $value;
  }
}
```
