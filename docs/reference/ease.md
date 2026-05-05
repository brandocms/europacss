# ease()

A CSS function that generates cubic-bezier easing values.

## Syntax

```css
ease('{type}.{direction}')
```

## Types

| Type | Description |
|------|-------------|
| `sine` | Subtle, gentle easing |
| `quad` | Quadratic (power of 2) |
| `cubic` | Cubic (power of 3) |
| `quart` | Quartic (power of 4) |
| `quint` | Quintic (power of 5) |
| `expo` | Exponential |
| `circ` | Circular |
| `back` | Overshoots slightly |
| `power1` | Alias for quad |
| `power2` | Alias for cubic |
| `power3` | Alias for quart |
| `power4` | Alias for quint |

## Directions

| Direction | Description |
|-----------|-------------|
| `in` | Starts slow, ends fast |
| `out` | Starts fast, ends slow |
| `inOut` | Slow at both ends |

## Usage

```css
.element {
  transition: all 300ms ease('cubic.out');
}

.modal {
  transition: transform 400ms ease('quart.inOut');
}

.button {
  transition: background-color 200ms ease('sine.out');
}

.drawer {
  transition: transform 500ms ease('expo.out');
}

.bounce {
  transition: transform 600ms ease('back.out');
}
```

## Output

```css
/* Input */
transition: all 300ms ease('cubic.out');

/* Output */
transition: all 300ms cubic-bezier(0.215, 0.61, 0.355, 1);
```
