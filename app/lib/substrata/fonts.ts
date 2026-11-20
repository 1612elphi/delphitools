export interface FontChoice {
	id: string;
	label: string;
	css: string;
}

export const FONT_CHOICES: FontChoice[] = [
	{
		id: 'sans',
		label: 'Sans',
		css: 'ui-sans-serif, system-ui, "Helvetica Neue", Arial, sans-serif',
	},
	{
		id: 'serif',
		label: 'Serif',
		css: 'ui-serif, Georgia, "Times New Roman", serif',
	},
	{
		id: 'mono',
		label: 'Mono',
		css: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
	},
];

const SANS = FONT_CHOICES[0]!.css;

// fontsource 5.3.0 subset ranges
const RANGES: Record<string, string> = {
	latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
	'latin-ext':
		'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
	cyrillic: 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116',
};

const BUNDLED = [
	{ id: 'inter', label: 'Inter', weight: '100 900' },
	{ id: 'jost', label: 'Jost', weight: '100 900' },
	{ id: 'oswald', label: 'Oswald', weight: '200 700' },
];

// prefix avoids local shadowing
const bundledFamily = (id: string) => `Substrata ${id}`;

FONT_CHOICES.push(
	...BUNDLED.map((f) => ({
		id: f.id,
		label: f.label,
		css: `"${bundledFamily(f.id)}", ${SANS}`,
	})),
);

let bundled: Promise<void> | null = null;

export function loadBundledFonts(): Promise<void> {
	bundled ??= Promise.all(
		BUNDLED.flatMap((f) =>
			Object.entries(RANGES).map(([subset, unicodeRange]) => {
				const face = new FontFace(
					bundledFamily(f.id),
					`url(/fonts/substrata/${f.id}-${subset}.woff2) format("woff2")`,
					{ weight: f.weight, unicodeRange },
				);
				document.fonts.add(face);
				return face.load();
			}),
		),
	).then(
		() => undefined,
		() => undefined,
	);
	return bundled;
}

let uploaded: string[] = [];
const listeners = new Set<() => void>();

export function getUploadedFonts(): string[] {
	return uploaded;
}

export function subscribeFonts(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export async function uploadLocalFont(file: File): Promise<string> {
	const family = file.name.replace(/\.[^.]+$/, '');
	const face = new FontFace(family, await file.arrayBuffer());
	await face.load();
	document.fonts.add(face);
	if (!uploaded.includes(family)) {
		uploaded = [...uploaded, family];
		for (const l of listeners) l();
	}
	return family;
}

export function resolveFontCss(family: string): string {
	const choice = FONT_CHOICES.find((c) => c.id === family);
	if (choice) return choice.css;
	if (uploaded.includes(family)) return `"${family}"`;
	return SANS;
}

export function fontLabel(family: string): string {
	return FONT_CHOICES.find((c) => c.id === family)?.label ?? family;
}
