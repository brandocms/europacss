module.exports = {
  // Global reference viewport width for dpx units
  dpxViewportSize: 1440,

  theme: {
    breakpoints: {
      xs: '0',
      sm: '740px',
      md: '1024px',
      lg: '1399px',
      xl: '1900px'
    },

    breakpointCollections: {
      $desktop: 'md/lg/xl',
      $tablet: 'sm',
      $mobile: 'xs'
    },

    container: {
      maxWidth: {
        xs: '740px',
        sm: '1024px',
        md: '100%',
        lg: '100%',
        xl: '100%'
      },

      padding: {
        xs: '15px',
        sm: '35px',
        md: '50px',
        lg: '100px',
        xl: '100px'
      }
    },

    columns: {
      gutters: {
        xs: '25px',
        sm: '35px',
        md: '50px',
        lg: '50px',
        xl: '60px'
      },

      count: {
        xs: 2,
        sm: 2,
        md: 6,
        lg: 6,
        xl: 6
      }
    },

    colors: {
      transparent: 'transparent',
      black: '#000',
      white: '#fff',
      grid: '#0095ff33'
    },

    arrows: {
      /* how far to translate arrow hover styles */
      travel: '5px'
    },

    typography: {
      /* `base` is the px value of 1rem set as font-size on the html element. */
      base: '18px',

      /* line heights per breakpoint */
      lineHeight: {
        xs: 1.6,
        sm: 1.6,
        md: 1.6,
        lg: 1.6,
        xl: 1.6
      },

      /* paddingDivider is used to set column-typography right padding. Lower values = more padding */
      paddingDivider: 6,

      /* main font sizing map */
      sizes: {
        /* this is per SIZE followed by per BREAKPOINT */
        /* the breakpoint value can be either a single value or an object */
        /* if an object, we iterate through and add as prop: value pairs. */
        '2xs': {
          xs: '9px',
          sm: '9px',
          md: '9px',
          lg: '10px',
          xl: '11px'
        },
        xs: {
          xs: '12px',
          sm: '12px',
          md: '12px',
          lg: '12px',
          xl: '14px'
        },
        sm: {
          xs: '14px',
          sm: '14px',
          md: '14px',
          lg: '14px',
          xl: '17px'
        },
        base: {
          xs: '17px',
          sm: '16px',
          md: '16px',
          lg: '17px',
          xl: '24px'
        },
        lg: {
          xs: '19px',
          sm: '21px',
          md: '21px',
          lg: '21px',
          xl: '22px'
        },
        xl: {
          xs: '20px',
          sm: '25px',
          md: '28px',
          lg: '28px',
          xl: '38px'
        },
        '2xl': {
          xs: '36px',
          sm: '36px',
          md: '42px',
          lg: '42px',
          xl: '42px'
        },
        '3xl': {
          xs: '51px',
          sm: '51px',
          md: '69px',
          lg: '69px',
          xl: '95px'
        },
        '4xl': {
          xs: '67px',
          sm: '75px',
          md: '79px',
          lg: '90px',
          xl: '95px'
        },

        // Hierarchical font size examples using slash notation
        'header/xsmall': {
          xs: '10px',
          sm: '11px',
          md: '12px',
          lg: '13px',
          xl: '14px'
        },
        'header/small': {
          xs: '14px',
          sm: '16px',
          md: '18px',
          lg: '20px',
          xl: '22px'
        },
        'header/large': {
          xs: '24px',
          sm: '28px',
          md: '32px',
          lg: '36px',
          xl: '40px'
        },
        'body/regular': {
          xs: '14px',
          sm: '15px',
          md: '16px',
          lg: '17px',
          xl: '18px'
        },
        'body/strong': {
          xs: '14px',
          sm: '15px',
          md: '16px',
          lg: '17px',
          xl: '18px'
        }
      },

      /* responsive font sizing */
      rfs: {
        minimum: {
          /* minimum values for responsive font sizes.
            max sizes are taken from theme.typography.sizes
            this is per SIZE followed by per BREAKPOINT */
          '2xs': {
            xs: '9px',
            sm: '9px',
            md: '9px',
            lg: '10px',
            xl: '11px'
          },
          xs: {
            xs: '12px',
            sm: '12px',
            md: '12px',
            lg: '12px',
            xl: '14px'
          },
          sm: {
            xs: '14px',
            sm: '14px',
            md: '14px',
            lg: '14px',
            xl: '17px'
          },
          base: {
            xs: '17px',
            sm: '16px',
            md: '16px',
            lg: '17px',
            xl: '24px'
          },
          lg: {
            xs: '19px',
            sm: '21px',
            md: '21px',
            lg: '21px',
            xl: '22px'
          },
          xl: {
            xs: '20px',
            sm: '25px',
            md: '28px',
            lg: '28px',
            xl: '38px'
          },
          '2xl': {
            xs: '36px',
            sm: '36px',
            md: '42px',
            lg: '42px',
            xl: '42px'
          },
          '3xl': {
            xs: '51px',
            sm: '51px',
            md: '69px',
            lg: '69px',
            xl: '95px'
          },
          '4xl': {
            xs: '67px',
            sm: '75px',
            md: '79px',
            lg: '90px',
            xl: '95px'
          }
        }
      },

      sections: {
        navigation: {
          xs: {
            'font-size': '17px',
            'line-height': '17px',
            'letter-spacing': '0.12rem'
          },
          sm: {
            'font-size': '17px',
            'line-height': '17px',
            'letter-spacing': '0.12rem'
          },
          md: {
            'font-size': '12px',
            'line-height': '12px',
            'letter-spacing': '0.12rem'
          },
          lg: {
            'font-size': '12px',
            'line-height': '12px',
            'letter-spacing': '0.12rem'
          },
          xl: {
            'font-size': '15px',
            'line-height': '15px',
            'letter-spacing': '2px'
          }
        }
      },

      families: {
        main: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
          '"Apple Color Emoji"',
          '"Segoe UI Emoji"',
          '"Segoe UI Symbol"',
          '"Noto Color Emoji"'
        ],

        serif: ['Georgia', 'Cambria', '"Times New Roman"', 'Times', 'serif'],

        mono: ['Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],

        // Hierarchical font family examples using slash notation
        'body/regular': [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif'
        ],
        'body/strong': [
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'sans-serif'
        ],
        'header/display': [
          'Georgia',
          'Cambria',
          '"Times New Roman"',
          'Times',
          'serif'
        ]
      }
    },

    header: {
      padding: {
        /* When header is small */
        small: {
          xs: {
            'padding-top': '30px',
            'padding-bottom': '30px'
          },
          sm: {
            'padding-top': '40px',
            'padding-bottom': '40px'
          },
          md: {
            'padding-top': '40px',
            'padding-bottom': '40px'
          },
          lg: {
            'padding-top': '40px',
            'padding-bottom': '40px'
          },
          xl: {
            'padding-top': '60px',
            'padding-bottom': '60px'
          }
        },
        /* When header is large */
        large: {
          xs: {
            'padding-top': '15px',
            'padding-bottom': '15px'
          },
          sm: {
            'padding-top': '40px',
            'padding-bottom': '40px'
          },
          md: {
            'padding-top': '40px',
            'padding-bottom': '40px'
          },
          lg: {
            'padding-top': '70px',
            'padding-bottom': '70px'
          },
          xl: {
            'padding-top': '80px',
            'padding-bottom': '80px'
          }
        }
      }
    },

    spacing: {
      /* this is per SIZE followed by per BREAKPOINT */
      xs: {
        xs: '10px',
        sm: '15px',
        md: '15px',
        lg: '15px',
        xl: '15px'
      },
      sm: {
        xs: '20px',
        sm: '25px',
        md: '30px',
        lg: '30px',
        xl: '45px'
      },
      md: {
        xs: '35px',
        sm: '40px',
        md: '50px',
        lg: '50px',
        xl: '70px'
      },
      lg: {
        xs: '50px',
        sm: '50px',
        md: '75px',
        lg: '75px',
        xl: '120px'
      },
      xl: {
        xs: '85px',
        sm: '100px',
        md: '140px',
        lg: '140px',
        xl: '180px'
      }
    }
  }
}
