import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'EuropaCSS',
  description: 'Responsive CSS with a native Rust compiler, JSON5 tokens and Config Studio',
  base: '/europacss/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/europacss/logo.svg' }]
  ],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Reference', link: '/reference/responsive' },
      {
        text: 'Vite',
        link: '/guide/vite'
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Native compiler guide',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Vite', link: '/guide/vite' },
            { text: 'Build & watch', link: '/guide/build' },
            { text: 'Lint & migration', link: '/guide/lint-and-migration' },
            { text: 'Config Studio', link: '/guide/studio' },
            { text: 'Development', link: '/guide/development' },
            { text: 'Legacy PostCSS', link: '/guide/legacy-postcss' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Layout',
          items: [
            { text: 'Nesting & reuse', link: '/reference/nesting' },
            { text: 'Bundles & helpers', link: '/reference/bundles' },
            { text: '@responsive', link: '/reference/responsive' },
            { text: '@space', link: '/reference/space' },
            { text: '@display', link: '/reference/display' },
            { text: '@column', link: '/reference/column' },
            { text: '@grid', link: '/reference/grid' },
            { text: '@order', link: '/reference/order' }
          ]
        },
        {
          text: 'Typography',
          items: [
            { text: '@fontsize', link: '/reference/fontsize' },
            { text: '@font', link: '/reference/font' }
          ]
        },
        {
          text: 'Visual',
          items: [
            { text: '@color', link: '/reference/color' },
            { text: '@embed-responsive', link: '/reference/embed-responsive' }
          ]
        },
        {
          text: 'Control Flow',
          items: [
            { text: '@if', link: '/reference/if' },
            { text: '@iterate', link: '/reference/iterate' },
            { text: '@unpack', link: '/reference/unpack' }
          ]
        },
        {
          text: 'Functions',
          items: [
            { text: 'ease()', link: '/reference/ease' },
            { text: 'theme()', link: '/reference/theme' }
          ]
        }
      ]
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/brandocms/europacss' }
    ],

    search: {
      provider: 'local'
    },

    outline: {
      level: [2, 3]
    }
  }
})
