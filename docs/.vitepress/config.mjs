import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'EuropaCSS',
  description: 'A PostCSS-based responsive design system framework',
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
        text: 'npm',
        link: 'https://www.npmjs.com/package/@brandocms/europacss'
      }
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'Getting Started', link: '/guide/getting-started' },
            { text: 'Configuration', link: '/guide/configuration' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Layout',
          items: [
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
            { text: 'ease()', link: '/reference/ease' }
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
