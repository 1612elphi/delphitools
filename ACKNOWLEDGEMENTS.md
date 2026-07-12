# Acknowledgements

delphitools is built on the shoulders of many excellent open source projects. Thank you to all the maintainers and contributors who make these tools available.

## Core Framework

- **[Next.js](https://nextjs.org/)** - The React framework for production
- **[React](https://react.dev/)** - A JavaScript library for building user interfaces
- **[Tailwind CSS](https://tailwindcss.com/)** - A utility-first CSS framework

## UI Components

- **[shadcn/ui](https://ui.shadcn.com/)** - Beautifully designed components built with Radix UI and Tailwind CSS
- **[Radix UI](https://www.radix-ui.com/)** - Unstyled, accessible UI primitives
- **[Lucide](https://lucide.dev/)** - Beautiful & consistent icons

## Tool-Specific Libraries

- **[color-names](https://github.com/meodai/color-names)** by meodai - A handpicked list of colour names for nearest-colour matching
- **[qr-code-styling](https://github.com/kozakdenys/qr-code-styling)** - QR code generation with styling options
- **[bwip-js](https://github.com/metafloor/bwip-js)** - Barcode generation (Data Matrix, Aztec, PDF417, Code 128, EAN-13, and more)
- **[SVGO](https://github.com/svg/svgo)** - SVG optimization
- **[JSZip](https://stuk.github.io/jszip/)** - Creating ZIP files in the browser
- **[react-markdown](https://github.com/remarkjs/react-markdown)** - Markdown rendering
- **[remark-gfm](https://github.com/remarkjs/remark-gfm)** - GitHub Flavored Markdown support
- **[Transformers.js](https://huggingface.co/docs/transformers.js)** - Run machine learning models in the browser

## Models

- **[BRIA AI RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4)** - Background removal model, licensed under [Creative Commons Attribution-NonCommercial-NoDerivatives 4.0 International](https://creativecommons.org/licenses/by-nc-nd/4.0/)

## Shape Data

- **[Phosphor Icons](https://phosphoricons.com/)** (v2.1.1, "fill" weight) - the Substrata preset-shape gallery vendors SVG path data from selected icons into `lib/substrata/preset-shapes.ts`, licensed under the [MIT License](https://github.com/phosphor-icons/core/blob/main/LICENSE) (Copyright (c) 2023 Phosphor Icons).

## Film Simulation Data

- **[RawTherapee Film Simulation Collection](https://rawpedia.rawtherapee.com/Film_Simulation)** by Pat David, Pavlov Dmitry and Michael Ezra - part of the film-emulation LUTs bundled in `public/substrata/luts/` are downsampled (HaldCLUT → 33³ packed strip) from this collection, licensed under [Creative Commons Attribution-ShareAlike 4.0 International](https://creativecommons.org/licenses/by-sa/4.0/); the derived files remain CC BY-SA 4.0. Film stock names appear for informational purposes only, per the collection's trademark disclaimer.
- **[spectral_film_lut](https://github.com/JanLohse/spectral_film_lut)** by Jan Lohse (MIT) - the remaining LUTs in `public/substrata/luts/` were generated with this tool, which physically models film stocks from their published datasheets (authentic negative → print chains, e.g. Kodak Vision3 5207 printed on Vision 2383).

## Utilities

- **[clsx](https://github.com/lukeed/clsx)** - Utility for constructing className strings
- **[tailwind-merge](https://github.com/dcastil/tailwind-merge)** - Merge Tailwind CSS classes without conflicts
- **[class-variance-authority](https://cva.style/)** - Creating variant-based component styles

---

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
