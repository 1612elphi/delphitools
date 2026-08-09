// Categories and shape for the curated palette collection, lifted from the Next
// app's lib/palette-collection.ts. Only the metadata is here; the 1,800-line
// list of palettes comes across with the palette-collection tool itself.

export interface CuratedPalette {
	id: string;
	name: string;
	colors: string[];
	category: PaletteCollectionCategory;
}

export type PaletteCollectionCategory =
	| 'classic'
	| 'nature'
	| 'keycaps'
	| 'vintage'
	| 'modern'
	| 'bold'
	| 'soft'
	| 'monochrome'
	| 'seasonal'
	| 'artistic';

export const COLLECTION_CATEGORIES: Record<
	PaletteCollectionCategory,
	{ label: string; description: string }
> = {
	classic: {
		label: 'Classic',
		description: 'Timeless, elegant combinations',
	},
	nature: {
		label: 'Nature',
		description: 'Inspired by the natural world',
	},
	keycaps: {
		label: 'Keycaps',
		description: 'Inspired by popular keycap sets',
	},
	vintage: {
		label: 'Vintage',
		description: 'Retro and nostalgic palettes',
	},
	modern: { label: 'Modern', description: 'Contemporary and trendy' },
	bold: { label: 'Bold', description: 'Vibrant and eye-catching' },
	soft: { label: 'Soft', description: 'Gentle and calming tones' },
	monochrome: {
		label: 'Monochrome',
		description: 'Single-hue explorations',
	},
	seasonal: { label: 'Seasonal', description: 'Capturing the seasons' },
	artistic: {
		label: 'Artistic',
		description: 'Inspired by art movements',
	},
};
