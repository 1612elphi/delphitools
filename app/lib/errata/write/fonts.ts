import type * as Mupdf from 'mupdf';
import { getMupdf } from 'delphitools-v2/lib/mupdf';
import type {
	FamilyId,
	Metrics,
	GlyphPick,
} from 'delphitools-v2/lib/errata/write/types';

const weight = (bold: boolean) => (bold ? 700 : 400);
const slant = (italic: boolean) => (italic ? 'italic' : 'normal');

function fontsource(id: string, label: string, hasItalic = true) {
	return {
		label,
		files: (bold: boolean, italic: boolean) =>
			['latin', 'latin-ext'].map(
				(subset) =>
					`${id}-${subset}-${weight(bold)}-${slant(italic && hasItalic)}.ttf`,
			),
	};
}

function cmu(id: string, label: string) {
	return {
		label,
		files: (bold: boolean, italic: boolean) => [
			`cmu-${id}-${weight(bold)}-${slant(italic)}.otf`,
		],
	};
}

export const FAMILIES: Record<
	FamilyId,
	{ label: string; files(bold: boolean, italic: boolean): string[] }
> = {
	'source-serif-4': fontsource('source-serif-4', 'Source Serif'),
	inter: fontsource('inter', 'Inter'),
	jost: fontsource('jost', 'Jost'),
	oswald: fontsource('oswald', 'Oswald', false),
	'ibm-plex-mono': fontsource('ibm-plex-mono', 'IBM Plex Mono'),
	'cmu-serif': cmu('serif', 'CMU Serif'),
	'cmu-sans': cmu('sans', 'CMU Sans'),
	'cmu-typewriter': cmu('typewriter', 'CMU Typewriter'),
};

/** CSS font-family name registered for one face file. */
export const cssFamily = (file: string) =>
	`write-${file.replace(/\.\w+$/, '')}`;

export function filesForFamilies(families: FamilyId[]): string[] {
	const files = new Set<string>();
	for (const id of families)
		for (const bold of [false, true])
			for (const italic of [false, true])
				for (const file of FAMILIES[id].files(
					bold,
					italic,
				))
					files.add(file);
	return [...files];
}

const loading = new Map<string, Promise<void>>();
const bytes = new Map<string, Uint8Array>();
const fonts = new Map<string, Mupdf.Font>();

async function load(file: string) {
	const res = await fetch(`/fonts/write/${file}`);
	if (!res.ok) throw new Error(`font ${file}: ${res.status}`);
	const data = new Uint8Array(await res.arrayBuffer());
	const face = new FontFace(cssFamily(file), data);
	document.fonts.add(await face.load());
	const mupdf = await getMupdf();
	fonts.set(file, new mupdf.Font(file, data));
	bytes.set(file, data);
}

export async function ensureFonts(files: string[]): Promise<void> {
	await Promise.all(
		files.map((file) => {
			let p = loading.get(file);
			if (!p) {
				p = load(file);
				p.catch(() => loading.delete(file));
				loading.set(file, p);
			}
			return p;
		}),
	);
}

function loaded<T>(map: Map<string, T>, file: string): T {
	const value = map.get(file);
	if (!value) throw new Error(`font ${file} not loaded`);
	return value;
}

export const fontBytes = (file: string) => loaded(bytes, file);
export const mupdfFont = (file: string) => loaded(fonts, file);

interface Face {
	files: string[];
	picks: Map<string, GlyphPick>;
}

const faces = new Map<string, Face>();
// runs repeat one face
let last: {
	family: FamilyId;
	bold: boolean;
	italic: boolean;
	face: Face;
} | null = null;

function faceOf(family: FamilyId, bold: boolean, italic: boolean): Face {
	if (
		last?.family === family &&
		last.bold === bold &&
		last.italic === italic
	)
		return last.face;
	const key = `${family}/${bold}/${italic}`;
	let face = faces.get(key);
	if (!face) {
		face = {
			files: FAMILIES[family].files(bold, italic),
			picks: new Map(),
		};
		faces.set(key, face);
	}
	last = { family, bold, italic, face };
	return face;
}

/** Metrics from the mupdf fonts that ensureFonts loaded. */
export const browserMetrics: Metrics = {
	pick(family, bold, italic, ch) {
		const face = faceOf(family, bold, italic);
		let pick = face.picks.get(ch);
		if (!pick) {
			const cp = ch.codePointAt(0) ?? 0;
			let file = face.files[0]!;
			let gid = 0;
			for (const f of face.files) {
				const g = mupdfFont(f).encodeCharacter(cp);
				if (g) {
					file = f;
					gid = g;
					break;
				}
			}
			pick = {
				file,
				advance: mupdfFont(file).advanceGlyph(gid),
			};
			face.picks.set(ch, pick);
		}
		return pick;
	},
};
