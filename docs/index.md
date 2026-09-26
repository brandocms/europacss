---
layout: home
hero:
  name: EuropaCSS
  text: Responsive design systems in CSS
  tagline: A native Rust compiler that turns JSON5 design tokens into responsive CSS, with a visual Config Studio.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Use with Vite
      link: /guide/vite

features:
  - title: Config-Driven
    details: Define breakpoints, spacing scales, typography, and colors in a single config file. EuropaCSS generates all the responsive CSS.
  - title: Design-First
    details: Built for agencies working with precise designs across breakpoints. Map Figma specs directly to configuration.
  - title: Custom At-Rules
    details: Write expressive CSS with @space, @fontsize, @responsive, @color and more. No utility class soup.
  - title: Native Compiler
    details: Compile CSS and run Config Studio with a standalone executable. No Node or PostCSS required for the native tools.
---


::: info Native compiler preview
These docs cover the experimental Rust compiler in this checkout. The published JavaScript package remains the [legacy PostCSS implementation](/guide/legacy-postcss). Existing sites should follow the [migration guide](/guide/lint-and-migration).
:::
