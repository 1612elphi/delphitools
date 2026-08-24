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
