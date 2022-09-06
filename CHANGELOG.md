# Changelog

### 0.11.1

- Add `data-moonwalk-section-ready` with opacity 1 to base.


### 0.11.0

- Allow using gutter selector in column "canvas":
  ```
  @column 8/8:1
  ```
- Add base font-size to `html`
- Add `--container-padding` css var to `:root` with breakpoints
- Allow passing colors/transparent to `@color`
- Allow passing font-size and line-height to size keys:
  ````
  h1: {
    iphone: '8vw/10vw',
    '*': '4vw/1.2'
  }
  ```


### 0.10.1

- Fix dist build


### 0.10.0

- Add wildcards to `sizing` and `typography.sizes`:
  ```
  sizing: {
    block: {
      '*': '4vw',
      desktop_xl: '3vw'
    }
  }
  ```
- Allow `setMaxForVw` to work with hard vw fontsize values: `@fontsize 4vw/4vw`.
- Use `setMaxForVw` for line height.
- Use `setMaxForVw` for column gutters.
- Set `ec-zoom` calculations for line heights with vw.
- Only apply firefox vw fix if flexSize has vw.

### 0.9.0

- Allow passing `var(--whatever)` to `@space`.
- Soft deprecate `@container`. Since `@container` will be part of the CSS spec, we better 
get out of the way. You can use `@space container` instead. Also `@space container desktop_md` to
lock to breakpoint.


### 0.8.0

- Add `setMaxForVw` config option.

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


### 0.7.0

- There is a slightly nasty Firefox bug with vw columns/gutters:

  For some reason, Firefox is not consistent with how it calculates vw widths.
  This manifests through our `@column` helper when wrapping. Sometimes when
  resizing, it will flicker the element down to the next row and up again, as
  if there is not enough room for the specified number of items to flex before
  wrap. We try to circumvent this by setting the element's `max-width` 0.002vw
  wider than the flex-basis.


### 0.6.4

- Add `@display` shortcut for responsive display decls. I.e
  `@display flex $mobile;` or `@display flex/row/wrap desktop_md`
- Add `@order` shortcut for responsive order decls. I.e
  `@order 1 $mobile;`


### 0.6.3

- Calc fontsize with `vw` with `--ec-zoom` variable. The `--ec-zoom` is set by Jupiter
  to enable browser zooming with `vw` type sizing.

### 0.6.2

- Drop `content-visibility`. Set it in your own stylesheet if you
  need to experiment with it

### 0.6.1

- Fixed `vertical-rhythm()` with `between()` values.

### 0.6.0

- Add `gap` to `@row` for adding margin-top to each of the row's
  decendents, except for N first.

### 0.5.0

- Allow using `calc(100vw - var[3/4])` etc in `@column`
- Allow using space constants and syntax inside config's typo size map:

  ```
  typography {
    sizes: {
      variable: {
        xs: '15px',
        md: 'between(15px-50px)',
        lg: 'container'
      }
    }
  }
  ```


### 0.4.0

- Allow using space constants and syntax inside config's spacing map:

  ```
  spacing: {
    variable: {
      xs: '15px',
      md: 'between(15px-50px)',
      lg: 'container'
    }
  }
  ```


### 0.3.0

- BREAKING: Removed `@rfs` -- use `@fontsize between(18px-22px)/1.5 $sm` instead.
- Add `between(min-max)` to `@space`
- Add `between(min-max)` tp `@fontsize`


### 0.2.3

- Add option to provide hardcoded `@fontsize` and `@rfs` parameters


### 0.2.2

- Fix `dbg-grid` for max sized containers.
- Add `translateX`, `translateY`, `translateZ` and `scale` shortcuts to `@space`


### 0.2.1

- Add `@grid`. Sets up column gap with correct gutter across all breakpoints.
- Allow querying `@fontsize` by keypath:
  `@fontsize product.name;`

  Config would then be:

  ```
  typography: {
    sizes: {
      product: {
        name: {
          xs: '14px',
          sm: '16px',
          // ...
        }
      }
    }
  }
  ```


### 0.2.0

- BREAKING: Enforce container max width config when using `@container`.
- Fix source mapping for most plugins
- Add optional breakpoint param to `@row <cols> [bpQuery]`
- Add simple calc() interpolation. I.e: `@space width calc(100vw - var[container] + var[1])`.
  `var[container]` gets replaced with the container padding for each breakpoint and `var[1]`
  gets replaced with 1 gutter unit for each breakpoint.
- Add `container/2` and `-container/2` as spacing options
  `@space container/2 $desktop;`
- Fix `@font` under `@responsive`


### 0.1.17

- Set default Moonwalk style to `opacity: 0` instead of `visibility: hidden`.
 Remember to update `jupiter` if you use Moonwalk. This was done to fix an
 accessibility problem when trying to tab to an invisible element.


### 0.1.16

- Add `-container` as `@space` param for negative container width


### 0.1.15

- Add `breakpointCollections` to config
- Allow setting a media query key to `@row`


### 0.1.14

- Reduced motion fix.


### 0.1.13

- Skip


### 0.1.12

- Add `@color` rule — `@color fg green.dark`
- Add child count parameter to `@row`
- Add `colors.grid` - colorizes the debug grid
- Bump dependencies


### 0.1.11

- Add `[data-moonwalk-run]` with visibility hidden


### 0.1.10

- Add `@font` rule. Selects family, can also be used for fontsize:
  `@font serif xs`


### 0.1.9

- Actually COMMIT the change from 0.1.8.. Jeez.


### 0.1.8

- Drop setting lineheights in body from Europa.
  Do this yourself in your own css:

  ```
  @iterate theme.typography.lineHeight {
    @responsive $key {
      line-height: $value;
    }
  }
  ```


### 0.1.7

- Fix @fontsize parsing under @responsive


### 0.1.6

- Nicer default underlines in base

**BREAKING CHANGES**
- Switch gutter sizing to be 1 whole unit of gutter instead of a half in `@space`. The brings
  it in line with `@column` spacing (which was 1 unit). So if you had:
  `@space margin-left 2;` it would now be `@space margin-left 1;`. You can still do half
  units: `@space margin-left 0.5;`


### 0.1.5

- Add moonwalk sections as initially hidden.
- Remove moonwalk opacity values
- Add Node 12 to test matrix


### 0.1.4

- Performance optimizations


### 0.1.3

- Bump dependencies
- Build base.css


### 0.1.2

- Add Chrome lazyload fix


### 0.1.1

- Allow advanced breakpoints as `@columns` param.
- Fix flex for IE11 by splitting out `flex: 0 0 x` to `flex-grow/shrink/..`
- More base styles.
- Align @columns param format with rest. Now is `@columns 1/3 xs`.
  Column alignment is removed.


### 0.1.0

- Initial release
