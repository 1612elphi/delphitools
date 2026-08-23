/**
 * Accept lists for the media tools, shared by the registry's `accepts` (which
 * routes omnibox drops) and by the tools' own file inputs, so the picker and
 * the drop target can never disagree.
 *
 * The extensions are not redundant with the wildcard: iOS maps `audio/*` to
 * the system's known audio UTIs, and formats it has no UTI for — Ogg, Opus —
 * grey out in the Files picker. Naming the extensions widens that set. (iPad,
 * 2026-08-11: neither .ogg nor .mp3 was selectable with a bare `audio/*`.)
 */
export const AUDIO_ACCEPT = [
	'audio/*',
	'.mp3',
	'.m4a',
	'.wav',
	'.aac',
	'.flac',
	'.ogg',
	'.oga',
	'.opus',
	'.aiff',
	'.caf',
];

export const VIDEO_ACCEPT = [
	'video/*',
	'.mp4',
	'.m4v',
	'.mov',
	'.webm',
	'.mkv',
	'.avi',
];
export const SUBTITLE_ACCEPT = ['.srt', '.vtt'];
export const TEXT_ACCEPT = ['.md', '.txt', 'text/markdown', 'text/plain'];

/** The same list as an `accept` attribute value. */
export const acceptAttr = (list: readonly string[]): string => list.join(',');

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
	/** file types the tool ingests (`.srt` / `image/*` forms, as in an
	 *  accept attribute) — the omnibox routes dropped files by this */
	accepts?: string[];
	/** reads `?color=` on load (lib/colour-query), so omnibox links to it
	 *  carry the detected colour */
	carryColour?: boolean;
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
				id: 'matte-genny',
				name: 'Matte Generator',
				description:
					'Put non-square images on a square matte',
				icon: 'square',
				href: '/tools/matte-genny',
				accepts: ['image/*'],
			},
			{
				id: 'scroll-genny',
				name: 'Seamless Scroll Generator',
				description:
					'Split images for Instagram carousel scrolls',
				icon: 'gallery-vertical',
				href: '/tools/scroll-genny',
				accepts: ['image/*'],
			},
			{
				id: 'social-cropper',
				name: 'Social Media Cropper',
				description:
					'Crop images for Instagram, Bluesky & Threads',
				icon: 'crop',
				href: '/tools/social-cropper',
				accepts: ['image/*'],
			},
			{
				id: 'watermarker',
				name: 'Watermarker',
				description: 'Add watermarks to images',
				icon: 'stamp',
				href: '/tools/watermarker',
				accepts: ['image/*'],
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
				accepts: ['image/*'],
				carryColour: true,
			},
			{
				id: 'colour-atlas',
				name: 'Colour Atlas',
				description:
					'Everything about one colour, on one page',
				icon: 'swatch-book',
				href: '/tools/colour-atlas',
				carryColour: true,
				new: true,
			},
			{
				id: 'colour-converter',
				name: 'Colour Converter',
				description: 'Convert between colour formats',
				icon: 'pipette',
				href: '/tools/colour-converter',
				carryColour: true,
			},
			{
				id: 'contrast-checker',
				name: 'Contrast Checker',
				description:
					'Check WCAG colour contrast compliance',
				icon: 'contrast',
				href: '/tools/contrast-checker',
				carryColour: true,
			},
			{
				id: 'gradient-genny',
				name: 'Gradient Generator',
				description:
					'Create linear, corner, and mesh gradients',
				icon: 'blend',
				href: '/tools/gradient-genny',
				carryColour: true,
			},
			{
				id: 'harmony-genny',
				name: 'Harmony Generator',
				description: 'Generate colour harmonies',
				icon: 'rainbow',
				href: '/tools/harmony-genny',
				carryColour: true,
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
				accepts: ['image/*'],
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
				accepts: ['image/*'],
			},
			{
				id: 'tailwind-shades',
				name: 'Tailwind Shade Generator',
				description: 'Generate Tailwind colour scales',
				icon: 'wind',
				href: '/tools/tailwind-shades',
				carryColour: true,
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
				accepts: ['image/*'],
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
				accepts: ['image/*'],
			},
			{
				id: 'background-remover',
				name: 'Background Remover',
				description:
					'Remove backgrounds from images automatically',
				icon: 'eraser',
				href: '/tools/background-remover',
				accepts: ['image/*'],
				beta: true,
			},
			{
				id: 'favicon-genny',
				name: 'Favicon Generator',
				description: 'Generate favicons from any image',
				icon: 'image',
				href: '/tools/favicon-genny',
				accepts: ['image/*'],
			},
			{
				id: 'image-clipper',
				name: 'Image Clipper',
				description:
					'Trim transparent edges from PNGs to the smallest dimensions',
				icon: 'crop',
				href: '/tools/image-clipper',
				accepts: ['.png'],
			},
			{
				id: 'image-compressor',
				name: 'Image Compressor',
				description:
					'Shrink JPEG, WebP, PNG and AVIF files',
				icon: 'shrink',
				href: '/tools/image-compressor',
				accepts: ['image/*'],
				new: true,
			},
			{
				id: 'image-converter',
				name: 'Image Converter',
				description:
					'Convert between PNG, JPEG, WebP, JXL, GIF, BMP, TIFF, ICO, ICNS with resize and format options',
				icon: 'refresh-cw',
				href: '/tools/image-converter',
				accepts: ['image/*', '.jxl'],
			},
			{
				id: 'image-splitter',
				name: 'Image Splitter',
				description: 'Split images into tiles',
				icon: 'scissors',
				href: '/tools/image-splitter',
				accepts: ['image/*'],
			},
			{
				id: 'image-stitcher',
				name: 'Image Stitcher',
				description: 'Combine multiple images into one',
				icon: 'combine',
				href: '/tools/image-stitcher',
				accepts: ['image/*'],
				new: true,
			},
			{
				id: 'image-tracer',
				name: 'Image Tracer',
				description:
					'Trace raster images to SVG vectors',
				icon: 'scan-line',
				href: '/tools/image-tracer',
				accepts: ['image/*'],
			},
			{
				id: 'metadata-stripper',
				name: 'Metadata Stripper',
				description:
					'Strip EXIF and GPS metadata from images',
				icon: 'shield-check',
				href: '/tools/metadata-stripper',
				accepts: ['image/*'],
				new: true,
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
				accepts: ['.svg'],
			},
			{
				id: 'base64-image-encoder',
				name: 'Base64 Image Encoder',
				description:
					'Convert images to Base64 strings for CSS/HTML embedding',
				icon: 'file-code',
				href: '/tools/base64-image-encoder',
				accepts: ['image/*'],
				new: true,
			},
		],
	},
	{
		id: 'audio-video',
		name: 'Audio & Video',
		tools: [
			{
				id: 'audio-atlas',
				name: 'Audio Atlas',
				description:
					'Everything about one audio file, on one page',
				icon: 'audio-lines',
				href: '/tools/audio-atlas',
				accepts: AUDIO_ACCEPT,
				new: true,
			},
			{
				id: 'audio-extractor',
				name: 'Audio Extractor',
				description:
					'Extract the audio out of a video file',
				icon: 'file-audio',
				href: '/tools/audio-extractor',
				accepts: VIDEO_ACCEPT,
				new: true,
			},
			{
				id: 'audio-normaliser',
				name: 'Audio Normaliser',
				description: 'Normalise audio loudness',
				icon: 'gauge',
				href: '/tools/audio-normaliser',
				accepts: AUDIO_ACCEPT,
				new: true,
			},
			{
				id: 'audio-trimmer',
				name: 'Audio Trimmer',
				description:
					'Cut and fade audio, export as WAV',
				icon: 'scissors',
				href: '/tools/audio-trimmer',
				accepts: AUDIO_ACCEPT,
				new: true,
			},
			{
				id: 'auto-subtitle',
				name: 'Auto Subtitle',
				description:
					'Transcribe audio and video to subtitles',
				icon: 'captions',
				href: '/tools/auto-subtitle',
				accepts: [...AUDIO_ACCEPT, ...VIDEO_ACCEPT],
				new: true,
			},
			{
				id: 'frame-extractor',
				name: 'Frame Extractor',
				description:
					'Grab stills and contact sheets from video',
				icon: 'film',
				href: '/tools/frame-extractor',
				accepts: VIDEO_ACCEPT,
				new: true,
			},
			{
				id: 'screen-recorder',
				name: 'Screen Recorder',
				description:
					'Record your screen with optional microphone audio',
				icon: 'monitor-up',
				href: '/tools/screen-recorder',
				new: true,
			},
			{
				id: 'subtitle-converter',
				name: 'Subtitle Converter',
				description:
					'Convert, shift and rescale SRT and VTT subtitles',
				icon: 'captions',
				href: '/tools/subtitle-converter',
				accepts: SUBTITLE_ACCEPT,
				new: true,
			},
			{
				id: 'subtitle-studio',
				name: 'Subtitle Studio',
				description: 'Burn subtitles to video',
				icon: 'subtitles',
				href: '/tools/subtitle-studio',
				accepts: [...VIDEO_ACCEPT, ...SUBTITLE_ACCEPT],
				new: true,
			},
			{
				id: 'timecode-calc',
				name: 'Timecode Calculator',
				description:
					'Add and subtract timecodes, drop-frame aware',
				icon: 'clock',
				href: '/tools/timecode-calc',
				new: true,
			},
			{
				id: 'video-atlas',
				name: 'Video Atlas',
				description: 'Everything about one video file',
				icon: 'clapperboard',
				href: '/tools/video-atlas',
				accepts: VIDEO_ACCEPT,
				new: true,
			},
			{
				id: 'video-muter',
				name: 'Video Muter',
				description: 'Strip the audio from a video',
				icon: 'volume-x',
				href: '/tools/video-muter',
				accepts: VIDEO_ACCEPT,
				new: true,
			},
			{
				id: 'video-to-gif',
				name: 'Video to GIF',
				description:
					'Turn video clips into looping GIFs',
				icon: 'clapperboard',
				href: '/tools/video-to-gif',
				accepts: VIDEO_ACCEPT,
				new: true,
			},
			{
				id: 'video-trimmer',
				name: 'Video Trimmer',
				description: 'Cut a video in/out style',
				icon: 'scissors',
				href: '/tools/video-trimmer',
				accepts: VIDEO_ACCEPT,
				new: true,
			},
			{
				id: 'voice-recorder',
				name: 'Voice Recorder',
				description:
					'Record voice memos in the browser',
				icon: 'mic',
				href: '/tools/voice-recorder',
				new: true,
			},
			{
				id: 'waveform-genny',
				name: 'Waveform Generator',
				description:
					'Render audio waveforms as PNG or SVG',
				icon: 'audio-waveform',
				href: '/tools/waveform-genny',
				accepts: AUDIO_ACCEPT,
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
				accepts: [
					'.md',
					'.html',
					'.docx',
					'.tex',
					'.epub',
				],
				new: true,
			},
			{
				id: 'text-editor',
				name: 'Text Editor',
				description: 'Distraction-free Markdown writer',
				icon: 'pen-line',
				href: '/tools/text-editor',
				accepts: TEXT_ACCEPT,
				new: true,
			},
			{
				id: 'font-explorer',
				name: 'Font File Explorer',
				description: 'Explore font file contents',
				icon: 'file-type',
				href: '/tools/font-explorer',
				accepts: ['.ttf', '.otf', '.woff', '.woff2'],
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
				accepts: ['text/*', '.txt', '.md'],
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
		id: 'pdf',
		name: 'PDF',
		tools: [
			{
				id: 'pdf-preflight',
				name: 'PDF Preflight',
				description:
					'Analyse PDFs for print-readiness issues',
				icon: 'file-search',
				href: '/tools/pdf-preflight',
				accepts: ['.pdf'],
			},
			{
				id: 'pdf-organiser',
				name: 'PDF Organiser',
				description:
					'Merge, split and rearrange PDF pages',
				icon: 'file-stack',
				href: '/tools/pdf-organiser',
				accepts: ['.pdf'],
			},
			{
				id: 'image-to-pdf',
				name: 'Images to PDF',
				description:
					'Turn images into a PDF, or pages into PNGs',
				icon: 'file-image',
				href: '/tools/image-to-pdf',
				accepts: ['image/*', '.pdf'],
			},
			{
				id: 'pdf-rotate-crop',
				name: 'PDF Rotate & Crop',
				description:
					'Rotate or crop pages or entire documents',
				icon: 'crop',
				href: '/tools/pdf-rotate-crop',
				accepts: ['.pdf'],
			},
			{
				id: 'pdf-page-numberer',
				name: 'PDF Page Numbers',
				description:
					'Add page numbers or stamps to documents',
				icon: 'file-digit',
				href: '/tools/pdf-page-numberer',
				accepts: ['.pdf'],
			},
			{
				id: 'pdf-compressor',
				name: 'PDF Compressor',
				description: 'Shrink PDF filesizes',
				icon: 'shrink',
				href: '/tools/pdf-compressor',
				accepts: ['.pdf'],
			},
		],
	},
	{
		id: 'print-production',
		name: 'Print & Production',
		tools: [
			{
				id: 'imposer',
				name: 'Print Imposer',
				description:
					'Impose PDF pages for booklet, saddle-stitch, and N-up printing',
				icon: 'layers',
				href: '/tools/imposer',
				accepts: ['.pdf'],
			},
			{
				id: 'zine-imposer',
				name: 'Zine Imposer',
				description:
					'Impose single-sheet zines: 8-page mini-zine and accordion folds',
				icon: 'book-open',
				href: '/tools/zine-imposer',
				accepts: ['.pdf'],
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
				id: 'http-status',
				name: 'HTTP Status',
				description:
					'Search HTTP status codes with phrases and spec references',
				icon: 'server',
				href: '/tools/http-status',
				new: true,
			},
			{
				id: 'password-genny',
				name: 'Password Generator',
				description:
					'Generate strong passwords or multi-word passphrases',
				icon: 'key-square',
				href: '/tools/password-genny',
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
				accepts: TEXT_ACCEPT,
			},
			{
				id: 'uuid-genny',
				name: 'UUID Generator',
				description:
					'Generate bulk UUID v4 or v7 and Nano IDs',
				icon: 'fingerprint',
				href: '/tools/uuid-genny',
				new: true,
			},
			{
				id: 'jwt-decoder',
				name: 'JWT Decoder',
				description:
					"Decode a JWT's header, payload & claims",
				icon: 'key-square',
				href: '/tools/jwt-decoder',
				new: true,
			},
			{
				id: 'cron-builder',
				name: 'Cron Builder',
				description:
					'Build a cron expression field by field or decode one',
				icon: 'calendar-clock',
				href: '/tools/cron-builder',
				new: true,
			},
			{
				id: 'json-formatter',
				name: 'JSON Formatter',
				description:
					'Format or minify JSON or look at it',
				icon: 'braces',
				href: '/tools/json-formatter',
				new: true,
				accepts: ['.json'],
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
