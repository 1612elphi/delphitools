/** kebab-case lucide-static icon name, resolved by <Icon> */
export type IconName = string;

export interface Tool {
	id: string;
	name: string;
	description: string;
	icon: IconName;
	href: string;
	beta?: boolean;
	new?: boolean;
	/** off-site / off-catalogue destination (App Store, GitHub) — the grid
	 *  renders a plain new-tab anchor and no /tools/[id] page is generated */
	external?: boolean;
	/** the flagship treatment: green accent, double-width cell, ghosted
	 *  wordmark backdrop (Substrata) */
	highlight?: boolean;
	/** tool page drops the max-w-4xl cap for the COMPONENT (header stays
	 *  capped) — for tools whose display wants the whole main column; the
	 *  component re-caps whatever chrome it wants narrow (Large Type) */
	wide?: boolean;
}

export interface ToolCategory {
	id: string;
	name: string;
	tools: Tool[];
}

export const toolCategories: ToolCategory[] = [
	{
		id: 'social-media',
		name: 'Social Media',
		tools: [
			{
				id: 'matte-generator',
				name: 'Matte Generator',
				description:
					'Put non-square images on a square matte',
				icon: 'square',
				href: '/tools/matte-generator',
			},
			{
				id: 'scroll-generator',
				name: 'Seamless Scroll Generator',
				description:
					'Split images for Instagram carousel scrolls',
				icon: 'gallery-vertical',
				href: '/tools/scroll-generator',
			},
			{
				id: 'social-cropper',
				name: 'Social Media Cropper',
				description:
					'Crop images for Instagram, Bluesky & Threads',
				icon: 'crop',
				href: '/tools/social-cropper',
			},
			{
				id: 'watermarker',
				name: 'Watermarker',
				description: 'Add watermarks to images',
				icon: 'stamp',
				href: '/tools/watermarker',
			},
		],
	},
	{
		id: 'colour',
		name: 'Colour',
		tools: [
			{
				id: 'colorblind-sim',
				name: 'Colour Blindness Simulator',
				description:
					'Simulate how colours appear to colour blind users',
				icon: 'eye',
				href: '/tools/colorblind-sim',
			},
			{
				id: 'colour-atlas',
				name: 'Colour Atlas',
				// ∑CG: catalogue description for Colour Atlas
				//   spec: max 60 chars, shown in the home grid cell and as the tool-page subtitle, sentence fragment matching the other descriptions
				//   sample: 'Everything about one colour, on one page'
				description: '∑CG',
				icon: 'swatch-book',
				href: '/tools/colour-atlas',
				new: true,
			},
			{
				id: 'colour-converter',
				name: 'Colour Converter',
				description: 'Convert between colour formats',
				icon: 'pipette',
				href: '/tools/colour-converter',
			},
			{
				id: 'contrast-checker',
				name: 'Contrast Checker',
				description:
					'Check WCAG colour contrast compliance',
				icon: 'contrast',
				href: '/tools/contrast-checker',
			},
			{
				id: 'gradient-genny',
				name: 'Gradient Generator',
				description:
					'Create linear, corner, and mesh gradients',
				icon: 'blend',
				href: '/tools/gradient-genny',
			},
			{
				id: 'harmony-genny',
				name: 'Harmony Generator',
				description: 'Generate colour harmonies',
				icon: 'rainbow',
				href: '/tools/harmony-genny',
			},
			{
				id: 'palette-collection',
				name: 'Palette Collection',
				description: 'Browse curated colour palettes',
				icon: 'library',
				href: '/tools/palette-collection',
			},
			{
				id: 'palette-extractor',
				name: 'Palette Extractor',
				description:
					'Extract colour palettes from images',
				icon: 'palette',
				href: '/tools/palette-extractor',
			},
			{
				id: 'palette-genny',
				name: 'Palette Generator',
				description:
					'Generate beautiful colour palettes',
				icon: 'pen-line',
				href: '/tools/palette-genny',
			},
			{
				id: 'pixel-picker',
				name: 'Pixel Picker',
				description:
					'Sample colours from any image with a zoom loupe',
				icon: 'crosshair',
				href: '/tools/pixel-picker',
			},
			{
				id: 'tailwind-shades',
				name: 'Tailwind Shade Generator',
				description: 'Generate Tailwind colour scales',
				icon: 'wind',
				href: '/tools/tailwind-shades',
			},
		],
	},
	{
		id: 'img-assets',
		name: 'Images & Assets',
		tools: [
			{
				// the editor lives at its own route — no /tools/[id] page (see
				// generateStaticParams filter); description is Ruby's billboard line
				id: 'substrata',
				name: 'Substrata',
				description:
					'Edit, arrange and mark up images in the browser',
				icon: 'brush',
				href: '/editor',
				beta: true,
				new: true,
				highlight: true,
			},
			{
				id: 'artwork-enhancer',
				name: 'Artwork Enhancer',
				description:
					'Add colour noise overlay to artwork',
				icon: 'sparkles',
				href: '/tools/artwork-enhancer',
			},
			{
				id: 'background-remover',
				name: 'Background Remover',
				description:
					'Remove backgrounds from images automatically',
				icon: 'eraser',
				href: '/tools/background-remover',
				beta: true,
			},
			{
				id: 'favicon-genny',
				name: 'Favicon Generator',
				description: 'Generate favicons from any image',
				icon: 'image',
				href: '/tools/favicon-genny',
			},
			{
				id: 'image-clipper',
				name: 'Image Clipper',
				description:
					'Trim transparent edges from PNGs to the smallest dimensions',
				icon: 'crop',
				href: '/tools/image-clipper',
			},
			{
				id: 'image-converter',
				name: 'Image Converter',
				description:
					'Convert between PNG, JPEG, WebP, JXL, GIF, BMP, TIFF, ICO, ICNS with resize and format options',
				icon: 'refresh-cw',
				href: '/tools/image-converter',
			},
			{
				id: 'image-splitter',
				name: 'Image Splitter',
				description: 'Split images into tiles',
				icon: 'scissors',
				href: '/tools/image-splitter',
			},
			{
				id: 'image-stitcher',
				name: 'Image Stitcher',
				description: 'Combine multiple images into one',
				icon: 'combine',
				href: '/tools/image-stitcher',
				new: true,
			},
			{
				id: 'image-tracer',
				name: 'Image Tracer',
				description:
					'Trace raster images to SVG vectors',
				icon: 'scan-line',
				href: '/tools/image-tracer',
			},
			{
				id: 'paste-image',
				name: 'Paste Image',
				description:
					'Paste and download an image from your clipboard',
				icon: 'clipboard-paste',
				href: '/tools/paste-image',
			},
			{
				id: 'placeholder-genny',
				name: 'Placeholder Generator',
				description: 'Generate placeholder images',
				icon: 'layout-grid',
				href: '/tools/placeholder-genny',
			},
			{
				id: 'svg-optimiser',
				name: 'SVG Optimiser',
				description: 'Optimise and minify SVG files',
				icon: 'file-image',
				href: '/tools/svg-optimiser',
			},
			{
				id: 'base64-image-encoder',
				name: 'Base64 Image Encoder',
				description:
					'Convert images to Base64 strings for CSS/HTML embedding',
				icon: 'file-code',
				href: '/tools/base64-image-encoder',
				new: true,
			},
		],
	},
	{
		id: 'typo-text',
		name: 'Typography & Text',
		tools: [
			{
				id: 'doc-converter',
				name: 'Document Converter',
				description:
					'Convert documents between Markdown, HTML, Word, LaTeX, EPUB and more',
				icon: 'file-type-2',
				href: '/tools/doc-converter',
				new: true,
			},
			{
				id: 'text-editor',
				name: 'Text Editor',
				description: 'Distraction-free Markdown writer',
				icon: 'pen-line',
				href: '/tools/text-editor',
				new: true,
			},
			{
				id: 'font-explorer',
				name: 'Font File Explorer',
				description: 'Explore font file contents',
				icon: 'file-type',
				href: '/tools/font-explorer',
			},
			{
				id: 'glyph-browser',
				name: 'Glyph Browser',
				description: 'Browse unicode glyphs',
				icon: 'type',
				href: '/tools/glyph-browser',
			},
			{
				id: 'large-type',
				name: 'Large Type',
				description: 'Text, but big',
				icon: 'case-upper',
				href: '/tools/large-type',
				new: true,
				wide: true,
			},
			{
				id: 'line-height-calc',
				name: 'Line Height Calculator',
				description: 'Calculate optimal line heights',
				icon: 'type',
				href: '/tools/line-height-calc',
			},
			{
				id: 'paper-sizes',
				name: 'Paper Sizes',
				description: 'Reference for paper dimensions',
				icon: 'file-text',
				href: '/tools/paper-sizes',
			},
			{
				id: 'px-to-rem',
				name: 'PX to REM',
				description: 'Convert pixels to rem units',
				icon: 'ruler',
				href: '/tools/px-to-rem',
			},
			{
				id: 'text-diff',
				name: 'Text Diff',
				description:
					'Compare two texts and highlight differences',
				icon: 'git-compare',
				href: '/tools/text-diff',
			},
			{
				id: 'typo-calc',
				name: 'Typography Calculator',
				description:
					'Convert between typographic units',
				icon: 'hash',
				href: '/tools/typo-calc',
			},
			{
				id: 'word-counter',
				name: 'Word Counter',
				description: 'Count words, characters and more',
				icon: 'book-open',
				href: '/tools/word-counter',
			},
		],
	},
	{
		id: 'print-production',
		name: 'Print & Production',
		tools: [
			{
				id: 'pdf-preflight',
				name: 'PDF Preflight',
				description:
					'Analyse PDFs for print-readiness issues',
				icon: 'file-search',
				href: '/tools/pdf-preflight',
			},
			{
				id: 'imposer',
				name: 'Print Imposer',
				description:
					'Impose PDF pages for booklet, saddle-stitch, and N-up printing',
				icon: 'layers',
				href: '/tools/imposer',
			},
			{
				id: 'zine-imposer',
				name: 'Zine Imposer',
				description:
					'Impose single-sheet zines: 8-page mini-zine and accordion folds',
				icon: 'book-open',
				href: '/tools/zine-imposer',
			},
		],
	},
	{
		id: 'other-tools',
		name: 'Other Tools',
		tools: [
			{
				id: 'code-genny',
				name: 'Barcode Generator',
				description:
					'Generate Data Matrix, Aztec, PDF417, Code 128, EAN-13, and more',
				icon: 'barcode',
				href: '/tools/code-genny',
			},
			{
				id: 'decoder',
				name: 'Cipher Decoder',
				description:
					'Decode classical ciphers manually or auto-detect the cipher',
				icon: 'key-round',
				href: '/tools/decoder',
				new: true,
			},
			{
				id: 'meta-tag-genny',
				name: 'Meta Tag Generator',
				description: 'Generate HTML meta tags',
				icon: 'tag',
				href: '/tools/meta-tag-genny',
			},
			{
				id: 'qr-genny',
				name: 'QR Generator',
				description:
					'Generate styled QR codes with custom colors, shapes, and logos',
				icon: 'qr-code',
				href: '/tools/qr-genny',
			},
			{
				id: 'regex-tester',
				name: 'Regex Tester',
				description: 'Test regular expressions',
				icon: 'regex',
				href: '/tools/regex-tester',
			},
			{
				id: 'tailwind-cheatsheet',
				name: 'Tailwind Cheat Sheet',
				description:
					'Quick reference for Tailwind classes',
				icon: 'book-open',
				href: '/tools/tailwind-cheatsheet',
			},
			{
				id: 'markdown-writer',
				name: 'Text Scratchpad',
				description:
					'Text editor with manipulation tools',
				icon: 'pen-line',
				href: '/tools/markdown-writer',
			},
		],
	},
	{
		id: 'calculators',
		name: 'Calculators',
		tools: [
			{
				id: 'algebra-calc',
				name: 'Algebra Calculator',
				description:
					'Symbolic algebra: simplify, factor, solve, derivatives',
				icon: 'variable',
				href: '/tools/algebra-calc',
			},
			{
				id: 'base-converter',
				name: 'Base Converter',
				description:
					'Convert between decimal, hex, binary, and octal',
				icon: 'binary',
				href: '/tools/base-converter',
			},
			{
				id: 'encoder',
				name: 'Encoding Tools',
				description:
					'Base64, URL encoding, and hash generation',
				icon: 'file-code',
				href: '/tools/encoder',
			},
			{
				id: 'graph-calc',
				name: 'Graph Calculator',
				description:
					'Plot and visualise mathematical functions',
				icon: 'line-chart',
				href: '/tools/graph-calc',
			},
			{
				id: 'sci-calc',
				name: 'Scientific Calculator',
				description:
					'Full-featured scientific calculator with history',
				icon: 'calculator',
				href: '/tools/sci-calc',
			},
			{
				id: 'time-calc',
				name: 'Time Calculator',
				description:
					'Unix timestamps, date arithmetic, timezone conversion',
				icon: 'clock',
				href: '/tools/time-calc',
			},
			{
				id: 'unit-converter',
				name: 'Unit Converter',
				description:
					'Convert between units of length, weight, data, and more',
				icon: 'scale',
				href: '/tools/unit-converter',
			},
		],
	},
	{
		id: 'turbo-nerd',
		name: 'Turbo-nerd Shit',
		tools: [
			{
				id: 'shavian-transliterator',
				name: 'Shavian Transliterator',
				description:
					'Transliterate English text to the Shavian alphabet',
				icon: 'languages',
				href: '/tools/shavian-transliterator',
			},
		],
	},
	{
		id: 'elsewhere',
		name: 'Elsewhere',
		tools: [
			{
				// descriptions reuse the retired download-card's shipped lines
				id: 'ios-app',
				name: 'delphitools for iOS',
				description:
					'Built natively for iPhone and iPad. No accounts, no tracking, no compromises.',
				icon: 'smartphone',
				href: 'https://apps.apple.com/us/app/delphitools/id6761313703',
				external: true,
			},
			{
				id: 'cli',
				name: 'delphitools CLI',
				description:
					'The same tools, in your shell. Entirely offline.',
				icon: 'square-terminal',
				href: 'https://github.com/1612elphi/delphitools-cli',
				external: true,
			},
		],
	},
];

export const allTools = toolCategories.flatMap((category) => category.tools);

// Featured tools for "Delphi's Greatest Hits" section
const featuredToolIds = [
	'substrata',
	'qr-genny',
	'palette-genny',
	'background-remover',
];
export const featuredTools = featuredToolIds
	.map((id) => allTools.find((tool) => tool.id === id))
	.filter((tool): tool is Tool => tool !== undefined);

/**
 * Route params for every catalogue entry that has a /tools/[toolId] page —
 * entries living at their own route (Substrata → /editor) or off-site are left
 * out. Used by the page and by its og.png card, which must generate in lockstep.
 */
export function toolPageParams(): { toolId: string }[] {
	return allTools
		.filter((tool) => tool.href.startsWith('/tools/'))
		.map((tool) => ({ toolId: tool.id }));
}

export function getToolById(id: string): Tool | undefined {
	return allTools.find((tool) => tool.id === id);
}

export function getCategoryByToolId(id: string): ToolCategory | undefined {
	return toolCategories.find((category) =>
		category.tools.some((tool) => tool.id === id),
	);
}
