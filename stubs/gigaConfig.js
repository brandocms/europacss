module.exports = {
  setMaxForVw: true,
  // Global reference viewport width for dpx units
  dpxViewportSize: 1440,
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

        serif: ['Martina Plantijn', 'Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],

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
