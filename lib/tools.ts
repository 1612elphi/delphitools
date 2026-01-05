import {
  Image,
  FileImage,
  Scissors,
  RefreshCw,
  Type,
  Ruler,
  FileText,
  LayoutGrid,
  Hash,
  BookOpen,
  FileType,
  QrCode,
  Barcode,
  Tag,
  Regex,
  Palette,
  Pipette,
  Rainbow,
  PenLine,
  LucideIcon,
  Crop,
  Square,
  GalleryVertical,
  Stamp,
  Sparkles,
  Contrast,
  Eye,
  Eraser,
  Library,
} from "lucide-react";

export interface Tool {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  href: string;
  beta?: boolean;
}

export interface ToolCategory {
  id: string;
  name: string;
  tools: Tool[];
}

export const toolCategories: ToolCategory[] = [
  {
    id: "social-media",
    name: "Social Media",
    tools: [
      {
        id: "social-cropper",
        name: "Social Media Cropper",
        description: "Crop images for Instagram, Bluesky & Threads",
        icon: Crop,
        href: "/tools/social-cropper",
      },
      {
        id: "matte-generator",
        name: "Matte Generator",
        description: "Put non-square images on a square matte",
        icon: Square,
        href: "/tools/matte-generator",
      },
      {
        id: "scroll-generator",
        name: "Seamless Scroll Generator",
        description: "Split images for Instagram carousel scrolls",
        icon: GalleryVertical,
        href: "/tools/scroll-generator",
      },
      {
        id: "watermarker",
        name: "Watermarker",
        description: "Add watermarks to images",
        icon: Stamp,
        href: "/tools/watermarker",
      },
    ],
  },
  {
    id: "colour",
    name: "Colour",
    tools: [
      {
        id: "colour-converter",
        name: "Colour Converter",
        description: "Convert between colour formats",
        icon: Pipette,
        href: "/tools/colour-converter",
      },
      {
        id: "tailwind-shades",
        name: "Tailwind Shade Generator",
        description: "Generate Tailwind colour scales",
        icon: Palette,
        href: "/tools/tailwind-shades",
      },
      {
        id: "harmony-genny",
        name: "Harmony Generator",
        description: "Generate colour harmonies",
        icon: Rainbow,
        href: "/tools/harmony-genny",
      },
      {
        id: "palette-genny",
        name: "Palette Generator",
        description: "Generate beautiful colour palettes",
        icon: PenLine,
        href: "/tools/palette-genny",
      },
      {
        id: "palette-collection",
        name: "Palette Collection",
        description: "Browse curated colour palettes",
        icon: Library,
        href: "/tools/palette-collection",
      },
      {
        id: "contrast-checker",
        name: "Contrast Checker",
        description: "Check WCAG colour contrast compliance",
        icon: Contrast,
        href: "/tools/contrast-checker",
      },
      {
        id: "colorblind-sim",
        name: "Colour Blindness Simulator",
        description: "Simulate how colours appear to colour blind users",
        icon: Eye,
        href: "/tools/colorblind-sim",
      },
    ],
  },
  {
    id: "img-assets",
    name: "Images & Assets",
    tools: [
      {
        id: "favicon-genny",
        name: "Favicon Generator",
        description: "Generate favicons from any image",
        icon: Image,
        href: "/tools/favicon-genny",
      },
      {
        id: "svg-optimiser",
        name: "SVG Optimiser",
        description: "Optimise and minify SVG files",
        icon: FileImage,
        href: "/tools/svg-optimiser",
      },
      {
        id: "placeholder-genny",
        name: "Placeholder Generator",
        description: "Generate placeholder images",
        icon: LayoutGrid,
        href: "/tools/placeholder-genny",
      },
      {
        id: "image-splitter",
        name: "Image Splitter",
        description: "Split images into tiles",
        icon: Scissors,
        href: "/tools/image-splitter",
      },
      {
        id: "image-converter",
        name: "Image Converter",
        description: "Convert between image formats",
        icon: RefreshCw,
        href: "/tools/image-converter",
      },
      {
        id: "artwork-enhancer",
        name: "Artwork Enhancer",
        description: "Add colour noise overlay to artwork",
        icon: Sparkles,
        href: "/tools/artwork-enhancer",
      },
      {
        id: "background-remover",
        name: "Background Remover",
        description: "Remove backgrounds from images automatically",
        icon: Eraser,
        href: "/tools/background-remover",
        beta: true,
      },
    ],
  },
  {
    id: "typo-text",
    name: "Typography & Text",
    tools: [
      {
        id: "px-to-rem",
        name: "PX to REM",
        description: "Convert pixels to rem units",
        icon: Ruler,
        href: "/tools/px-to-rem",
      },
      {
        id: "line-height-calc",
        name: "Line Height Calculator",
        description: "Calculate optimal line heights",
        icon: Type,
        href: "/tools/line-height-calc",
      },
      {
        id: "typo-calc",
        name: "Typography Calculator",
        description: "Convert between typographic units",
        icon: Hash,
        href: "/tools/typo-calc",
      },
      {
        id: "paper-sizes",
        name: "Paper Sizes",
        description: "Reference for paper dimensions",
        icon: FileText,
        href: "/tools/paper-sizes",
      },
      {
        id: "word-counter",
        name: "Word Counter",
        description: "Count words, characters and more",
        icon: BookOpen,
        href: "/tools/word-counter",
      },
      {
        id: "glyph-browser",
        name: "Glyph Browser",
        description: "Browse unicode glyphs",
        icon: Type,
        href: "/tools/glyph-browser",
      },
      {
        id: "font-explorer",
        name: "Font File Explorer",
        description: "Explore font file contents",
        icon: FileType,
        href: "/tools/font-explorer",
      },
    ],
  },
  {
    id: "other-tools",
    name: "Other Tools",
    tools: [
      {
        id: "markdown-writer",
        name: "Text Scratchpad",
        description: "Text editor with manipulation tools",
        icon: PenLine,
        href: "/tools/markdown-writer",
      },
      {
        id: "tailwind-cheatsheet",
        name: "Tailwind Cheat Sheet",
        description: "Quick reference for Tailwind classes",
        icon: BookOpen,
        href: "/tools/tailwind-cheatsheet",
      },
      {
        id: "qr-genny",
        name: "QR Generator",
        description: "Generate styled QR codes with custom colors, shapes, and logos",
        icon: QrCode,
        href: "/tools/qr-genny",
      },
      {
        id: "code-genny",
        name: "Barcode Generator",
        description: "Generate Data Matrix, Aztec, PDF417, Code 128, EAN-13, and more",
        icon: Barcode,
        href: "/tools/code-genny",
      },
      {
        id: "meta-tag-genny",
        name: "Meta Tag Generator",
        description: "Generate HTML meta tags",
        icon: Tag,
        href: "/tools/meta-tag-genny",
      },
      {
        id: "regex-tester",
        name: "Regex Tester",
        description: "Test regular expressions",
        icon: Regex,
        href: "/tools/regex-tester",
      },
      {
        id: "zine-imposer",
        name: "Zine Imposer",
        description: "Create 8-page mini-zine imposition layouts",
        icon: BookOpen,
        href: "/tools/zine-imposer",
      },
    ],
  },
];

export const allTools = toolCategories.flatMap((category) => category.tools);

// Featured tools for "Delphi's Greatest Hits" section
export const featuredToolIds = ["qr-genny", "palette-genny", "background-remover"];
export const featuredTools = featuredToolIds
  .map((id) => allTools.find((tool) => tool.id === id))
  .filter((tool): tool is Tool => tool !== undefined);

export function getToolById(id: string): Tool | undefined {
  return allTools.find((tool) => tool.id === id);
}

export function getCategoryByToolId(id: string): ToolCategory | undefined {
  return toolCategories.find((category) =>
    category.tools.some((tool) => tool.id === id)
  );
}
