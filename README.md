<p align="center">
  <sup><em>«On the count of ten you will be in...»</em></sup>
</p>

![](http://univers.agency/europa.svg)

<p align="center">
    <a href="https://travis-ci.org/univers-agency/europacss"><img src="https://img.shields.io/travis/univers-agency/europacss/master.svg" alt="Build Status"></a>
    <a href="https://badge.fury.io/js/%40univers-agency%2Feuropacss"><img src="https://badge.fury.io/js/%40univers-agency%2Feuropacss.svg" alt="npm version" height="18"></a>
</p>

------

EuropaCSS originally began as a collection of SASS mixins and functions that came in
handy when working with design agencies that had very specific designs over different
breakpoints. These design systems translate pretty well to configurations and allows
weeding out a lot of the boilerplate involved.

## USAGE WITH WEBPACK

Example `postcss.config.js`:

```js
module.exports = {
  plugins: [
    require('postcss-easy-import')({
      prefix: '_',
      extensions: ['pcss', 'scss', 'css'],
      plugins: [
        require('stylelint')
      ]
    }),
    require('@univers-agency/europacss'),
    require('autoprefixer')({ grid: 'on' }),
    require('css-mqgroup')({ sort: true }),
    require('postcss-reporter')({ clearReportedMessages: true, throwError: false })
  ]
}
```

## NOTES

- Remember to keep your `@import` statements at the top of your `.pcss` file
- Add

```
@europa arrows;
@europa base;
```

  to your main stylesheet


## CONFIG

`setMaxForVw`

If you have a set max size for your largest container, you should enable `setMaxForVw`. This will
ensure that the largest breakpoint of your vw based sizes will be set to a fixed size.

For instance, if you have:
```
{
  setMaxForVw: true,
  theme: {
    container: {
      maxWidth: {
        mobile: '100%',
        tablet: '100%',
        desktop: '1920px'
      }
    },
    typography: {
      sizes: {
        h1: {
          mobile: '18px',
          tablet: '4vw',
          desktop: '4vw'
        }
      }
    }
  }
}
```
we will replace the desktop key's `4vw` with `1920/100*4` so that the font will not scale
beyond the container's maxWidth.

`dpxViewportSize`

When working with design pixel units (dpx), you can specify a reference viewport width to convert
design pixels to viewport width units. This is especially useful when working with Figma designs
that are created at a specific desktop width (commonly 1440px).

For example, if you have:
```
{
  dpxViewportSize: 1440, // Default is 1440px if not specified
  theme: {
    typography: {
      sizes: {
        heading: {
          mobile: '25dpx',
          tablet: '35dpx',
          desktop: '45dpx'
        }
      }
    }
  }
}
```

When using `25dpx` at the reference viewport width of 1440px, it will be converted to `1.736vw`
(`(25/1440)*100`). This makes it easy to maintain the exact sizing from design files while keeping
the responsive behavior of viewport units.


### Typography
#### Sizes

`typography`
  `sizes`
    `size_name`
      `breakpoint_name`: `value`

**Examples**

A regular setup:

```
  typography: {
    sizes: {
      base: {
        mobile: '16px'
      }
    }
  }
```

If `value` is an object, all properties will be added to the selector, i.e:

```
  typography: {
    sizes: {
      base: {
        mobile: {
          'font-size': '16px',
          'line-height': 1.25
        }
      }
    }
  }
```


## AT-RULES

todo

### `@responsive {breakpointQuery} {block}`

**EXAMPLE**:

```
@responsive desktop_md {
  display: none;
}

@responsive <=ipad_portrait {
  color: red;
}
```


### `@color {fg/bg/stroke/fill/border/border-[top|bottom|left|right]} {colorName/hex}`

Tries to get `colorName` from `theme.colors`, otherwise passes the color through

**EXAMPLE**:

```
h2 {
  @color fg headings.h2;
  @color bg transparent;
}
```


### `@grid`

Sets column gap to your gutter configuration across all breakpoints.

**EXAMPLE**:

```
.my-grid {
  @grid;
  grid-template-areas: "a b"
                       "a c";
  grid-template-columns: 6fr 6fr;

  .a {
    grid-area: a;
  }

  .b {
    grid-area: b;
  }

  .c {
    grid-area: c;
  }
}
```

This creates a 6 columns wide stacking grid.


### `@display [displayType[/flexDirection][/flexWrap]] [breakpointQuery]`

Add shortcut for responsive display decls.

**EXAMPLE**:

```
article {
  @display flex $mobile;
}

article {
  @display flex/row/wrap $mobile;
}
```


### `@order {orderNumber} [breakpointQuery]`

Add shortcut for responsive order decls.

**EXAMPLE**:

```
article {
  @order 1 $mobile;
}
```


### `@row [childrenPerRow[/wrapModifier][/verticalGap]] [breakpointQuery]`

Spaces children correctly per row. Does not set child widths/columns!
If no params are given, only the first child gets a margin-left of 0.

`wrapModifier` defaults to `nowrap`.
`verticalGap` defaults to nothing.

**EXAMPLE**:

```
.row {
  @row 3/wrap;

  .child {
    @column 4/12;
  }
}

/* to apply the `sm` spacing as margin-top for every child, except the 3 first: */
.row {
  @row 3/wrap/sm;

  .child {
    @column 4/12;
  }
}

```


### `@embed-responsive {aspectRatio}

**PARAMS**:

`{aspectRatio}`
  - 16/9


### `@space {decl} {sizeQuery} [breakpointQuery]`

**PARAMS**:

`{decl}`
  - `container` (does not accept `sizeQuery`, only `[breakpointQuery]`)
  - `margin-x`, `margin-y`, `padding-x`, `padding-y`
  - `translateX`, `translateY`, `translateZ`, `scale`
  - Any prop that accepts the values you give it.

`{sizeQuery}`
  - `xs` > Gets XS from `theme.spacing` map.
  - `2` > Gets `2` times the gutter padding.
  - `1/3` > Calcs a fraction.
  - `3:1/6` > Calcs a 3/6 fraction but with 1 added gutter unit
  - `xs/2` > Gets half of the XS from `theme.spacing` map.
  - `between(20px-50px)` > Scales the value from 20px at the start of breakpoint to 50px at the end of breakpoint.
  - `container` > Gets value from `theme.container.padding` for breakpoint.
  - `-container` > Gets negative value of `theme.container.padding` for breakpoint.
  - `vertical-rhythm(theme.typography.sizes.xl)` > Grabs object for breakpoint and multiplies with default line-height.
  - `vertical-rhythm(theme.typography.sizes.xl, 1.2)` > Grabs object for breakpoint and multiplies with 1.2 as line-height.
  - `calc(100vw - var[container] + var[1])` > Switches out `var[container]` and `var[1]` with correct values for
    container padding and 1 gutter unit per breakpoint.
  - `20dpx` > Design pixel units that scale with viewport width based on the `dpxViewportSize` setting (defaults to 1440px).

**EXAMPLES**:

```postcss
.block {
  @space margin-y xl/2;

  &:first-of-type {
    @space margin-top xl;
  }

  &:last-of-type {
    @space margin-bottom: xl;
  }
}

.powerful-stuff {
  /* move element 4 columns + a gutter size to the left */
  @space translateX calc(var[4:1/12] * -1);
}
```

If you need the set properties to be marked as `!important` you can use `@space!`

```postcss
  @space! margin-left xs;
```

### `@font {fontFamily} [fsQuery]`

Selects a font family. Can also be passed a font size query.

**PARAMS**:

`{fontFamily}`
  - picks `fontFamily` from `typography.families`

`[fsQuery]`
  - can also be passed. Will then create a `@fontsize` rule with `fsQuery` as params


### `@fontsize {fsQuery} [breakpointQuery]`

**PARAMS**:

`{fsQuery}`
  - `lg` > Picks the `lg` key from `theme.typography.sizes` across breakpoints
  - `lg/2.0` > Also sets `line-height` to `2.0`
  - `lg(2.0)/2.0` > Adds a modifier `(2.0)` that gets used as a multiplier in a calc() for the final font-size.
  - `between(18px-22px)` > Responsive font sizing, from 18px to 22px. Needs a breakpoint to function properly.
  - `product.size` > Traverses the keypath `product.size` within `theme.typography.sizes`
  - `20dpx` > Design pixel units that scale with viewport width based on the `dpxViewportSize` setting (defaults to 1440px)

`[breakpointQuery]`
  - `xs` > Only for the `xs` breakpoint
  - `>=md` > Only for larger or equal to `md`


### `@if {value} {block}`

Renders `{block}` if `{value}` is true. Ignores it otherwise.

**PARAMS**:

`{value}`
  - `theme.typography.optimizeLegibility` > Checks value in theme config.

**EXAMPLES**:

```postcss
@if theme.typography.optimizeLegibility {
  article {
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
}
```


### `@column {sizeQuery} [breakpointQuery] `

Creates a flex column inside rule.

**PARAMS**:

`{sizeQuery}`
  - `1/3` > Takes up one third of container, across all breakpoints
  - `3:1/6` > Takes up one third of container, across all breakpoints, with 1 unit of gutter
  - `calc(var[container] + var[6/12])` > 6/12 columns + width of container gutter

`[breakpointQuery]`
  - `xs` > For xs breakpoint only
  - `xs/sm/xl` > For xs, sm and xl breakpoints
  - `<=md` > Less and equal to the md breakpoint


**EXAMPLES**:

```postcss
article {
  @column 1/3;
  @column 3/3 xs;
}
/* Column is 1/3 wide on all devices, except xs, which is 3/3. */
```

### `@iterate {iterable} block`

Iterates through a config object.

**PARAMS**:

`{iterable}`
  - a path in the theme.object, I.E `theme.header.padding.small`

**EXAMPLES**:

```postcss
article {
  @iterate theme.header.padding.small {
    @responsive $key {
      padding-top: $value;
      padding-bottom: $value;
    }
  }
}
```

This creates a media query for each key in `theme.header.padding.small`

### `@unpack {object}`

Unpacks a config object.

**PARAMS**:

`{object}`
  - a path in the theme object, I.E `theme.typography.sections.navigation`

**EXAMPLES**:

```postcss
article {
  @unpack theme.typography.sections.navigation;
}
```

results in

```css
  @media (min-size: 0) and (max-size: 749px) {
    article {
      font-size: 1.2rem;
      line-height: 1.6;
    }
  }

  @media (min-size: 750px) and (max-size: 1039px) {
    article {
      font-size: 1.4rem;
      line-height: 1.5;
    }
  }

  /* ... */
```


## POSTCSS PLUGINS IN USE

This would not be possible without the following great plugins:

  - `postcss-extend-rule`
  - `postcss-functions`
  - `postcss-nested`
