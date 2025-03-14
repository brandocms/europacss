const postcss = require('postcss')
const plugin = require('../../src')

function run(input, opts) {
  return postcss([plugin(opts)]).process(input, { from: undefined })
}

const DEFAULT_CFG = {
  theme: {
    colors: {
      green: {
        dark: '#22AA22',
        light: '#AAFFAA',
        test: {
          one: '#ffffff',
          two: '#000000'
        }
      },
      gray: {
        100: '#111111',
        200: '#222222'
      }
    }
  }
}

it('basic test', () => {
  const input = `
  html {
    color: red;
  }
  `

  const output = `
  html {
    color: red;
  }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('basic nesting', () => {
  const input = `
  html {
    body {
      color: red;
      header {
        color: blue;
        h2 {
          font-size: 16px;
        }
      }
    }
  }
  `

  const output = `
    html body {
      color: red;
    }
    html body header {
      color: #00f;
    }
    html body header h2 {
      font-size: 16px;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('@extend', () => {
  const input = `
  %action_button {
    color: black;
    font-size: 14px;
    background-color: yellow;
    padding: 5px 15px;
    border-radius: 6px;
  }

  html {
    body {
      color: red;
      header {
        color: blue;
        button {
          @extend %action_button;
        }
      }
    }
  }
  `

  const output = `
    html body {
      color: red;
    }
    html body header {
      color: #00f;
    }
    html body header button {
      color: #000;
      background-color: #ff0;
      border-radius: 6px;
      padding: 5px 15px;
      font-size: 14px;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('@color', () => {
  const input = `
  html {
    body {
      font-size: 16px;
      @color bg black;
      @color fg white;
    }
  }
  `

  const output = `
    html body {
      color: #fff;
      background-color: #000;
      font-size: 16px;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('combine selectors', () => {
  const input = `
    article.test {
      color: red;
    }

    h1 {
      font-size: 24px;
    }

    article.test {
      background-color: blue;
    }
  `

  const output = `
    article.test {
      color: red;
      background-color: blue;
    }

    h1 {
      font-size: 24px;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('combine mq', () => {
  const input = `
    @media (min-width: 768px) {
      article.test {
        color: red;
      }
    }

    h1 {
      font-size: 24px;
    }

    @media (min-width: 768px) {
      h1 {
        font-size: 48px;
      }
    }

    @media (min-width: 1024px) {
      h1 {
        font-size: 48px;
      }
    }

    @media (min-width: 1024px) {
      h1 {
        line-height: 48px;
      }
    }
  `

  const output = `
    h1 {
      font-size: 24px;
    }

    @media (min-width: 768px) {
      article.test {
        color: red;
      }

      h1 {
        font-size: 48px;
      }
    }

    @media (min-width: 1024px) {
      h1 {
        font-size: 48px;
        line-height: 48px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('combine mqs when using @responsive', () => {
  const input = `
    article {
      @responsive xs {
        font-size: 12px;
        color: blue;
      }

      color: red;

      @responsive xs {
        background-color: red;
      }
    }
  `

  const output = `
    article {
      color: red;
    }

    @media (width >= 0) and (width <= 739px) {
      article {
        color: #00f;
        background-color: red;
        font-size: 12px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('combine mqs when using @space', () => {
  const input = `
    article {
      color: red;
      @space padding-top 15px xs;
      @space padding-bottom 15px xs;
    }
  `

  const output = `
    article {
      color: red;
    }

    @media (width >= 0) and (width <= 739px) {
      article {
        padding-top: 15px;
        padding-bottom: 15px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('combine mqs when using @responsive and @space', () => {
  const input = `
    article {
      color: red;
      @responsive xs {
        padding-top: 15px;
      }
      @space padding-bottom 15px xs;
    }
  `

  const output = `
    article {
      color: red;
    }

    @media (width >= 0) and (width <= 739px) {
      article {
        padding-top: 15px;
        padding-bottom: 15px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('combine mqs when advanced', () => {
  const input = `
    article {
      @color bg black;
      @color fg white;

      .inner {
        @space container;

        article {
          @responsive md {
            font-size: 12px;
            color: blue;
          }

          @responsive xs {
            font-size: 10px;
            color: blue;
          }

          @space padding-top 15px xs;
        }
      }
    }
  `

  const output = `
    article {
      color: #fff;
      background-color: #000;
    }
    @media (width >= 0) and (width <= 739px) {
      article .inner {
        width: 100%;
        max-width: 740px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 15px;
        padding-right: 15px;
      }
      article .inner article {
        color: #00f;
        padding-top: 15px;
        font-size: 10px;
      }
    }
    @media (width >= 740px) and (width <= 1023px) {
      article .inner {
        width: 100%;
        max-width: 1024px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 35px;
        padding-right: 35px;
      }
    }
    @media (width >= 1024px) and (width <= 1398px) {
      article .inner {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding-left: 50px;
        padding-right: 50px;
      }
      article .inner article {
        color: #00f;
        font-size: 12px;
      }
    }
    @media (width >= 1399px) {
      article .inner {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding-left: 100px;
        padding-right: 100px;
      }
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('nested @extend', () => {
  const input = `
    article {
      color: blue;
      header {
        .something {
          font-size: 10px;
          [data-script="article"] & {
            font-size: 12px;
          }
        }
      }
    }
  `

  const output = `
    article {
      color: #00f;
    }
    article header .something {
      font-size: 10px;
    }
    [data-script=\"article\"] article header .something {
      font-size: 12px;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('nested @extend &', () => {
  const input = `
    %list {
      list-style-type: none;
      font-size: 12px;
    }

    article {
      color: blue;
      header {
        .something {
          font-size: 10px;
          [data-script="article"] & {
            @extend %list;
          }
        }
      }
    }
  `

  const output = `
    article {
      color: #00f;
    }

    article header .something {
      font-size: 10px;
    }

    [data-script=\"article\"] article header .something {
      font-size: 12px;
      list-style-type: none;
    }
  `

  return run(input, DEFAULT_CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})

it('nested @extend fancy %', () => {
  const CFG = {
    setMaxForVw: true,
    theme: {
      breakpoints: {
        iphone: '0',
        mobile: '480px',
        ipad_portrait: '768px',
        ipad_landscape: '1024px',
        desktop_md: '1200px',
        desktop_lg: '1440px',
        desktop_xl: '1920px'
      },

      breakpointCollections: {
        $mobile: '<=mobile',
        $tablet: 'ipad_portrait/ipad_landscape',
        $desktop: '>=desktop_md',
        $lg: '>=ipad_landscape',
        $sm: '<=ipad_portrait'
      },

      colors: () => ({
        black: '#000000',
        white: '#ffffff',
        dark: '#2b2b2b',
        light: '#f9f7f4',
        transparent: 'transparent',
        dbg: 'pink',

        beige: '#F5EED6',
        dark_gray: '#1F2117',
        dark_grey: '#1F2117',
        yellow: '#F5E3A3',
        light_yellow: '#fefbf1',
        dark_blue: '#0E1527',
        off_white: '#FFFEFB',

        body: {
          foreground: '#000',
          background: '#FFFEFB'
        },

        link: {
          regular: {
            text: '#000000',
            border: '#000000'
          },
          hover: {
            text: '#000000',
            border: '#000000'
          }
        },

        gray: {
          900: '#858585'
        },

        fader: {
          background: '#f9f7f4',
          foreground: '#2b2b2b'
        },

        footer: {
          background: '#f9ece5'
        },

        header: {
          background: '#f9f7f4',
          foreground: '#000000'
        },

        navigation: {
          backgroundAlt: 'ghostwhite'
        }
      }),

      container: {
        maxWidth: {
          iphone: '100%',
          mobile: '560px',
          ipad_portrait: '810px',
          ipad_landscape: '100%',
          desktop_md: '100%',
          desktop_lg: '100%',
          desktop_xl: '1920px'
        },

        padding: {
          iphone: '20px',
          mobile: '20px',
          ipad_portrait: '20px',
          ipad_landscape: '20px',
          desktop_md: '1.389vw',
          desktop_lg: '1.389vw',
          desktop_xl: '1.389vw'
        }
      },

      columns: {
        count: {
          iphone: 4,
          mobile: 4,
          ipad_portrait: 4,
          ipad_landscape: 12,
          desktop_md: 12,
          desktop_lg: 12,
          desktop_xl: 12
        },
        gutters: {
          iphone: '20px',
          mobile: '20px',
          ipad_portrait: '20px',
          ipad_landscape: '20px',
          desktop_md: '1.5vw',
          desktop_lg: '1.5vw',
          desktop_xl: '1.5vw'
        }
      },

      typography: {
        /* `base` is the px value of 1rem set as font-size on the html element. */
        base: '20px',

        /* line heights per breakpoint */
        lineHeight: {
          iphone: 1.5,
          mobile: 1.5,
          ipad_portrait: 1.5,
          ipad_landscape: 1.5,
          desktop_md: 1.5,
          desktop_lg: 1.5,
          desktop_xl: 1.5
        },

        /* main font sizing map */
        sizes: {
          /* this is per SIZE followed by per BREAKPOINT */
          base: {
            iphone: '16px',
            mobile: '4.25vw',
            ipad_portrait: '2.1vw',
            ipad_landscape: '1.6vw',
            desktop_md: '1.5vw',
            desktop_lg: '1.5vw',
            desktop_xl: '1.5vw'
          },

          nav: {
            iphone: '32px',
            mobile: '32px',
            ipad_portrait: '32px',
            '*': '12px'
          },

          mono: {
            iphone: '11px/115%',
            mobile: '11px/115%',
            '*': '12px/115%'
          },

          mono_responsive: {
            iphone: '11px/115%',
            mobile: '11px/115%',
            ipad_portrait: '12px/115%',
            ipad_landscape: '12px/115%',
            desktop_md: '12px/115%',
            desktop_lg: '0.857vw/115%',
            desktop_xl: '0.857vw/115%'
          },

          mono_spaced: {
            iphone: '11px/155%',
            mobile: '11px/155%',
            '*': '12px/155%'
          },

          body: {
            iphone: '16px/140%',
            mobile: '16px/140%',
            ipad_portrait: '16px/140%',
            ipad_landscape: '18px/140%',
            desktop_md: '18px/140%',
            '*': '1.25vw/140%'
          },

          small: {
            iphone: '16px/140%',
            mobile: '16px/140%',
            ipad_portrait: '16px/140%',
            '*': '1.111vw/140%'
          },

          xsmall: {
            '*': '0.972vw/125%'
          },

          h0: {
            '*': '5.556vw/120%'
          },

          h1: {
            iphone: {
              'font-size': '32px',
              'line-height': '120%',
              'letter-spacing': '-0.02em'
            },
            mobile: {
              'font-size': '32px',
              'line-height': '120%',
              'letter-spacing': '-0.02em'
            },
            ipad_portrait: {
              'font-size': '48px',
              'line-height': '120%',
              'letter-spacing': '-0.02em'
            },
            ipad_landscape: {
              'font-size': '52px',
              'line-height': '120%',
              'letter-spacing': '-0.02em'
            },
            desktop_md: {
              'font-size': '56px',
              'line-height': '120%',
              'letter-spacing': '-0.02em'
            },

            '*': {
              'font-size': '3.889vw',
              'line-height': '120%',
              'letter-spacing': '-0.02em'
            }
          },

          h2: {
            iphone: {
              'font-size': '28px',
              'line-height': '120%',
              'letter-spacing': '-0.02em'
            },
            mobile: {
              'font-size': '28px',
              'line-height': '120%',
              'letter-spacing': '-0.02em'
            },
            ipad_portrait: {
              'font-size': '36px',
              'line-height': '120%',
              'letter-spacing': '-0.02em'
            },
            '*': '2.778vw/120%'
          },

          h3: {
            iphone: {
              'font-size': '24px',
              'line-height': '130%',
              'letter-spacing': '-0.02em'
            },
            mobile: {
              'font-size': '24px',
              'line-height': '130%',
              'letter-spacing': '-0.02em'
            },
            ipad_portrait: {
              'font-size': '28px',
              'line-height': '130%',
              'letter-spacing': '-0.02em'
            },
            ipad_landscape: {
              'font-size': '32px',
              'line-height': '130%',
              'letter-spacing': '-0.02em'
            },
            desktop_md: {
              'font-size': '32px',
              'line-height': '130%',
              'letter-spacing': '-0.02em'
            },
            '*': '2.222vw/130%'
          },

          artikkel_ingress: {
            iphone: '24px/120%',
            mobile: '24px/120%',
            ipad_portrait: '25px/130%',
            ipad_landscape: '25px/130%',
            desktop_md: '27px/130%',
            '*': {
              'font-size': '1.9vw',
              'line-height': '130%'
            }
          },

          h4: {
            iphone: '20px/130%',
            mobile: '20px/130%',
            ipad_portrait: '20px/130%',
            ipad_landscape: '24px/130%',
            desktop_md: '24px/130%',
            '*': '1.667vw/130%'
          }
        },

        sections: {
          navigation: {
            iphone: { 'font-size': '34px' },
            mobile: { 'font-size': '34px' },
            ipad_portrait: { 'font-size': '42px' },
            ipad_landscape: { 'font-size': '20px' },
            desktop_md: { 'font-size': '20px' },
            desktop_lg: { 'font-size': '20px' },
            desktop_xl: { 'font-size': '20px' }
          }
        },

        families: {
          main: [
            'Deckard',
            '-apple-system',
            'BlinkMacSystemFont',
            '"Segoe UI"',
            'Roboto',
            '"Helvetica Neue"',
            'Arial',
            'sans-serif'
          ],

          serif: [
            'Martina Plantijn',
            'Georgia',
            'Cambria',
            '"Times New Roman"',
            'Times',
            'serif'
          ],

          mono: [
            'ABC Rom Mono',
            'Menlo',
            'Monaco',
            'Consolas',
            '"Liberation Mono"',
            '"Courier New"',
            'monospace'
          ]
        }
      },

      spacing: {
        block: {
          /* 80px */
          iphone: '40px',
          mobile: '40px',
          ipad_portrait: '80px',
          '*': '5.714vw'
        },

        block_half: {
          /* 40px */
          iphone: '20px',
          mobile: '20px',
          ipad_portrait: '40px',
          '*': '2.857vw'
        },

        block_double: {
          /* 160px */
          iphone: '80px',
          mobile: '80px',
          ipad_portrait: '80px',
          '*': '11.111vw'
        },

        block_triple: {
          /* 240px */
          iphone: '120px',
          mobile: '120px',
          ipad_portrait: '120px',
          '*': '16.667vw'
        },

        xs: {
          iphone: '15px',
          mobile: 'between(15px-18px)',
          ipad_portrait: 'between(18px-20px)',
          ipad_landscape: 'between(20px-25px)',
          desktop_md: 'between(25px-35px)',
          desktop_lg: 'between(35px-45px)',
          desktop_xl: '50px'
        }
      },

      header: {
        sections: {
          brand: {
            iphone: {
              width: '100px',
              height: '100px'
            },
            mobile: {
              width: '100px',
              height: '100px'
            },
            ipad_portrait: {
              width: '100px',
              height: '100px'
            },
            ipad_landscape: {
              width: '100px',
              height: '100px'
            },
            desktop_md: {
              width: '100px',
              height: '100px'
            },
            desktop_lg: {
              width: '100px',
              height: '100px'
            },
            desktop_xl: {
              width: '100px',
              height: '100px'
            }
          }
        },

        padding: {
          /* When header is small */
          small: {
            iphone: {
              'padding-top': '30px',
              'padding-bottom': '30px'
            },
            mobile: {
              'padding-top': '30px',
              'padding-bottom': '30px'
            },
            ipad_portrait: {
              'padding-top': '40px',
              'padding-bottom': '40px'
            },
            ipad_landscape: {
              'padding-top': '40px',
              'padding-bottom': '40px'
            },
            desktop_md: {
              'padding-top': '40px',
              'padding-bottom': '35px'
            },
            desktop_lg: {
              'padding-top': '40px',
              'padding-bottom': '35px'
            },
            desktop_xl: {
              'padding-top': '60px',
              'padding-bottom': '60px'
            }
          },
          /* When header is large */
          large: {
            iphone: {
              'padding-top': '15px',
              'padding-bottom': '15px'
            },
            mobile: {
              'padding-top': '15px',
              'padding-bottom': '15px'
            },
            ipad_portrait: {
              'padding-top': '40px',
              'padding-bottom': '40px'
            },
            ipad_landscape: {
              'padding-top': '40px',
              'padding-bottom': '60px'
            },
            desktop_md: {
              'padding-top': '40px',
              'padding-bottom': '20px'
            },
            desktop_lg: {
              'padding-top': '70px',
              'padding-bottom': '35px'
            },
            desktop_xl: {
              'padding-top': '80px',
              'padding-bottom': '40px'
            }
          }
        }
      }
    }
  }

  const input = `
    %tag {
      a,
      button {
        @font mono mono;
        @space letter-spacing 0.3px >=ipad_portrait;
        background-color: #f7f5ed;
        text-transform: uppercase;
        display: flex;
        height: 30px;
        padding: 5px 13px 4px 13px;
        justify-content: center;
        align-items: center;
        gap: 10px;
        border-radius: 40px;
        border: none;
        transition:
          background-color 150ms ease,
          color 150ms ease !important;
        user-select: none;

        span {
          transition:
            transform 150ms ease,
            color 150ms ease !important;
        }

        &:hover {
          @responsive >=ipad_portrait {
            @color bg dark_grey;
            @color fg white;
          }
          span {
            transform: translateX(3px);
            transition:
              transform 150ms ease,
              color 0ms ease !important;
          }
        }

        &.active,
        &[data-active] {
          @color bg dark_grey;
          @color fg white;
          span {
            transform: translateX(3px);
            transition:
              transform 150ms ease,
              color 0ms ease !important;
          }
        }
      }
    }

    [b-tpl="tag cloud"] {
      @space container;
      @space! padding-top 0 $lg;
      @space! margin-top calc(var[block] * -1) $lg;

      .inner {
        @display flex;
        align-items: center;

        @responsive ipad_portrait {
          flex-direction: column;
          gap: 50px;
        }

        @responsive $mobile {
          flex-direction: column;
          gap: 50px;
        }

        > .tags {
          @display flex;
          @column 5/12 $lg;
          @column 12/12 ipad_portrait;
          @column 12/12 $mobile;
          justify-content: center;
          align-items: center;

          .tags-inner {
            display: flex;
            flex-wrap: wrap;
            justify-content: center;
            align-items: center;
            @space width 400px $lg;
            @space width 400px ipad_portrait;
            @space gap 0.25em;
            @space gap 0.25em ipad_portrait;
            @space gap 0.25em $mobile;
            @extend %tag;

            button {
              position: relative;
              overflow: clip;

              &[data-active] {
                background-color: #000 !important;
              }

              &:hover {
                background-color: #000 !important;
              }

              span {
                z-index: 1;
                transform: translateX(0) !important;
              }

              .progress {
                z-index: 0;
                transform: scale(0, 1);
                transform-origin: 0% 50%;
                position: absolute;
                width: 100%;
                height: 100%;
                top: 0;
                left: 0;
                transition: background-color 250ms ease;

                &.running {
                  background-color: #18306d;
                }

                &.done {
                  background-color: transparent;
                }
              }
            }
          }
        }

        > .cases {
          @column 7/12 $lg;
          @column 1/1 ipad_portrait;
          @space width 100% ipad_portrait;

          .canvas {
            display: grid;
            grid-template-areas: "stack";
            place-items: center;
            position: relative;
            display: none;
            height: 100%;

            @responsive $lg {
              aspect-ratio: 1/1;
            }

            @responsive ipad_portrait {
              @space padding-bottom 75px;
            }

            @responsive $mobile {
              @space padding-bottom 75px;
            }

            &[data-active] {
              display: grid;
            }

            .case-card {
              grid-area: stack;
              position: relative;
              max-width: none;
              user-select: none;
              transform: translateZ(0px);
              -webkit-transform: translateZ(0px);

              &:hover {
                img {
                  transform: none;
                  user-select: none;
                  pointer-events: none;
                }
              }

              .reveal-tags {
                pointer-events: all;
              }

              .meta {
                opacity: 0;
                transition: opacity 0.5s ease;
              }

              &[data-active] + .case-card {
                .meta {
                  @responsive >=ipad_portrait {
                    opacity: 1;
                  }

                  .button {
                    @responsive >=ipad_portrait {
                      background-color: black;
                    }
                  }
                }
              }

              &:nth-child(1),
              &:nth-child(2) {
                z-index: 1;
                transform: translate(0, 0);
                @space width 450px >=desktop_lg;
                @space width 350px desktop_md;
                @space width 325px ipad_landscape;
                @space width 290px ipad_portrait;
                @space width 150px $mobile;

                .cover-and-link {
                  animation:
                    hoverV 1.5s alternate infinite ease-in-out,
                    hoverH 2.5s alternate infinite ease-in-out;
                }
              }
              &:nth-child(2) {
                z-index: 50;
                pointer-events: none;
              }

              &:nth-child(3),
              &:nth-child(4) {
                z-index: 2;
                @space width 275px >=desktop_lg;
                @space width 225px desktop_md;
                @space width 225px ipad_landscape;
                @space width 225px ipad_portrait;
                @space width 125px $mobile;
                transform: translate(-100%, 15%);

                .cover-and-link {
                  animation:
                    hoverV 4.5s alternate infinite ease-in-out,
                    hoverH 2s alternate infinite ease-in-out;
                }
              }
              &:nth-child(4) {
                z-index: 51;
                pointer-events: none;
              }

              &:nth-child(5),
              &:nth-child(6) {
                z-index: 3;
                @space width 275px >=desktop_lg;
                @space width 225px desktop_md;
                @space width 225px ipad_landscape;
                @space width 225px ipad_portrait;
                @space width 125px $mobile;
                transform: translate(85%, -12%);

                .cover-and-link {
                  animation:
                    hoverV 2.5s alternate infinite ease-in-out,
                    hoverH 3s alternate infinite ease-in-out;
                }
              }
              &:nth-child(6) {
                z-index: 56;
                pointer-events: none;
              }
            }
          }
        }
      }
    }
  `

  const output = `
    [b-tpl=\"tag cloud\"] .inner {
      align-items: center;
      display: flex;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags {
      justify-content: center;
      align-items: center;
      display: flex;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner {
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: 0.25em;
      display: flex;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a,
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button {
      text-transform: uppercase;
      user-select: none;
      background-color: #f7f5ed;
      border: none;
      border-radius: 40px;
      justify-content: center;
      align-items: center;
      gap: 10px;
      height: 30px;
      padding: 5px 13px 4px;
      font-family: ABC Rom Mono, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace;
      display: flex;
      transition: background-color 0.15s, color 0.15s !important;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a span,
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button span {
      transition: transform 0.15s, color 0.15s !important;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a:hover span,
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button:hover span {
      transform: translateX(3px);
      transition: transform 0.15s, color !important;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a.active,
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a[data-active],
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button.active,
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button[data-active] {
      color: #fff;
      background-color: #1f2117;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a.active span,
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a[data-active] span,
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button.active span,
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button[data-active] span {
      transform: translateX(3px);
      transition: transform 0.15s, color !important;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button {
      position: relative;
      overflow: clip;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button[data-active],
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button:hover {
      background-color: #000 !important;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button span {
      z-index: 1;
      transform: translateX(0) !important;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button .progress {
      z-index: 0;
      transform-origin: 0%;
      width: 100%;
      height: 100%;
      transition: background-color 0.25s;
      position: absolute;
      top: 0;
      left: 0;
      transform: scale(0, 1);
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button .progress.running {
      background-color: #18306d;
    }
    [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button .progress.done {
      background-color: #0000;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas {
      grid-template-areas: \"stack\";
      place-items: center;
      height: 100%;
      display: none;
      position: relative;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas[data-active] {
      display: grid;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card {
      user-select: none;
      grid-area: stack;
      max-width: none;
      position: relative;
      transform: translateZ(0);
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:hover img {
      user-select: none;
      pointer-events: none;
      transform: none;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card .reveal-tags {
      pointer-events: all;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card .meta {
      opacity: 0;
      transition: opacity 0.5s;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:first-child,
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) {
      z-index: 1;
      transform: translate(0);
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:first-child .cover-and-link,
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) .cover-and-link {
      animation: 1.5s ease-in-out infinite alternate hoverV, 2.5s ease-in-out infinite alternate hoverH;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) {
      z-index: 50;
      pointer-events: none;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(3),
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4) {
      z-index: 2;
      transform: translate(-100%, 15%);
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(3) .cover-and-link,
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4) .cover-and-link {
      animation: 4.5s ease-in-out infinite alternate hoverV, 2s ease-in-out infinite alternate hoverH;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4) {
      z-index: 51;
      pointer-events: none;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(5),
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) {
      z-index: 3;
      transform: translate(85%, -12%);
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(5) .cover-and-link,
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) .cover-and-link {
      animation: 2.5s ease-in-out infinite alternate hoverV, 3s ease-in-out infinite alternate hoverH;
    }
    [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) {
      z-index: 56;
      pointer-events: none;
    }
    @media (width >= 0) and (width <= 479px), (width >= 1024px) and (width <= 1199px) {
      [b-tpl=\"tag cloud\"] {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding-left: 20px;
        padding-right: 20px;
      }
    }
    @media (width >= 0) and (width <= 767px) {
      [b-tpl=\"tag cloud\"] .inner {
        flex-direction: column;
        gap: 50px;
      }
      @media (width >= 0) and (width <= 479px) {
        [b-tpl=\"tag cloud\"] .inner > .cases .canvas {
          padding-bottom: 75px;
        }
      }
      @media (width >= 480px) and (width <= 767px) {
        [b-tpl=\"tag cloud\"] .inner > .cases .canvas {
          padding-bottom: 75px;
        }
      }
    }
    @media (width >= 0) and (width <= 479px) {
      [b-tpl=\"tag cloud\"] .inner > .tags {
        flex: 0 0 100%;
        max-width: 100%;
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner {
        gap: 0.25em;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a,
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button {
        font-size: 11px;
        line-height: 115%;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:first-child,
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) {
        width: 150px;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(3),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(5),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) {
        width: 125px;
      }
    }
    @media (width >= 480px) and (width <= 767px) {
      [b-tpl=\"tag cloud\"] {
        width: 100%;
        max-width: 560px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 20px;
        padding-right: 20px;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags {
        flex: 0 0 100%;
        max-width: 100%;
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner {
        gap: 0.25em;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a,
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button {
        font-size: 11px;
        line-height: 115%;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:first-child,
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) {
        width: 150px;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(3),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(5),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) {
        width: 125px;
      }
    }
    @media (width >= 768px) {
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a:hover,
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button:hover {
        color: #fff;
        background-color: #1f2117;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card[data-active] + .case-card .meta {
        opacity: 1;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card[data-active] + .case-card .meta .button {
        background-color: #000;
      }
    }
    @media (width >= 768px) and (width <= 1023px) {
      [b-tpl=\"tag cloud\"] {
        width: 100%;
        max-width: 810px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 20px;
        padding-right: 20px;
      }
      [b-tpl=\"tag cloud\"] .inner {
        flex-direction: column;
        gap: 50px;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags {
        flex: 0 0 100%;
        max-width: 100%;
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner {
        gap: 0.25em;
        width: 400px;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a,
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button {
        letter-spacing: 0.3px;
        font-size: 12px;
        line-height: 115%;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases {
        flex: 0 0 100%;
        width: 100%;
        max-width: 100%;
        position: relative;
      }
      @media (width >= 768px) and (width <= 1023px) {
        [b-tpl=\"tag cloud\"] .inner > .cases .canvas {
          padding-bottom: 75px;
        }
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:first-child,
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) {
        width: 290px;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(3),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(5),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) {
        width: 225px;
      }
    }
    @media (width >= 1024px) and (width <= 1199px) {
      [b-tpl=\"tag cloud\"] {
        margin-top: -5.714vw !important;
        padding-top: 0 !important;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags {
        flex: 0 0 calc(41.6667% - 11.6667px);
        max-width: calc(41.6667% - 11.6667px);
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner {
        width: 400px;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a,
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button {
        letter-spacing: 0.3px;
        font-size: 12px;
        line-height: 115%;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases {
        flex: 0 0 calc(58.3333% - 8.33333px);
        max-width: calc(58.3333% - 8.33333px);
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:first-child,
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) {
        width: 325px;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(3),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(5),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) {
        width: 225px;
      }
    }
    @media (width >= 1024px) {
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas {
        aspect-ratio: 1;
      }
    }
    @media (width >= 1200px) and (width <= 1919px) {
      [b-tpl=\"tag cloud\"] {
        width: 100%;
        max-width: 100%;
        margin-left: auto;
        margin-right: auto;
        padding-left: 1.389vw;
        padding-right: 1.389vw;
      }
    }
    @media (width >= 1200px) and (width <= 1439px) {
      [b-tpl=\"tag cloud\"] {
        margin-top: -5.714vw !important;
        padding-top: 0 !important;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags {
        flex: 0 0 calc(41.6667% - 0.875vw);
        max-width: calc(41.6667% - 0.877vw);
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner {
        width: 400px;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a,
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button {
        letter-spacing: 0.3px;
        font-size: 12px;
        line-height: 115%;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases {
        flex: 0 0 calc(58.3333% - 0.625vw);
        max-width: calc(58.3333% - 0.627vw);
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:first-child,
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) {
        width: 350px;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(3),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(5),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) {
        width: 225px;
      }
    }
    @media (width >= 1440px) and (width <= 1919px) {
      [b-tpl=\"tag cloud\"] {
        margin-top: -5.714vw !important;
        padding-top: 0 !important;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags {
        flex: 0 0 calc(41.6667% - 0.875vw);
        max-width: calc(41.6667% - 0.877vw);
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner {
        width: 400px;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a,
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button {
        letter-spacing: 0.3px;
        font-size: 12px;
        line-height: 115%;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases {
        flex: 0 0 calc(58.3333% - 0.625vw);
        max-width: calc(58.3333% - 0.627vw);
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:first-child,
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) {
        width: 450px;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(3),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(5),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) {
        width: 275px;
      }
    }
    @media (width >= 1920px) {
      [b-tpl=\"tag cloud\"] {
        width: 100%;
        max-width: 1920px;
        margin-left: auto;
        margin-right: auto;
        padding-left: 26.6688px;
        padding-right: 26.6688px;
        margin-top: -109.709px !important;
        padding-top: 0 !important;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags {
        flex: 0 0 calc(41.6667% - 16.8px);
        max-width: calc(41.6667% - 16.8px);
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner {
        width: 400px;
      }
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner a,
      [b-tpl=\"tag cloud\"] .inner > .tags .tags-inner button {
        letter-spacing: 0.3px;
        font-size: 12px;
        line-height: 115%;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases {
        flex: 0 0 calc(58.3333% - 12px);
        max-width: calc(58.3333% - 12px);
        position: relative;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:first-child,
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(2) {
        width: 450px;
      }
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(3),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(4),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(5),
      [b-tpl=\"tag cloud\"] .inner > .cases .canvas .case-card:nth-child(6) {
        width: 275px;
      }
    }
  `

  return run(input, CFG).then(result => {
    expect(result.css).toMatchCSS(output)
    expect(result.warnings().length).toBe(0)
  })
})
