// shared with index build
export function photoWords(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[^a-z]+/)
		.filter((w) => w.length > 2)
		.map((w) =>
			w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w,
		);
}
