// itu-r exception: !;&_$
export const MORSE: Record<string, string> = {
	A: '.-',
	B: '-...',
	C: '-.-.',
	D: '-..',
	E: '.',
	F: '..-.',
	G: '--.',
	H: '....',
	I: '..',
	J: '.---',
	K: '-.-',
	L: '.-..',
	M: '--',
	N: '-.',
	O: '---',
	P: '.--.',
	Q: '--.-',
	R: '.-.',
	S: '...',
	T: '-',
	U: '..-',
	V: '...-',
	W: '.--',
	X: '-..-',
	Y: '-.--',
	Z: '--..',
	'0': '-----',
	'1': '.----',
	'2': '..---',
	'3': '...--',
	'4': '....-',
	'5': '.....',
	'6': '-....',
	'7': '--...',
	'8': '---..',
	'9': '----.',
	'.': '.-.-.-',
	',': '--..--',
	'?': '..--..',
	"'": '.----.',
	'!': '-.-.--',
	'/': '-..-.',
	'(': '-.--.',
	')': '-.--.-',
	'&': '.-...',
	':': '---...',
	';': '-.-.-.',
	'=': '-...-',
	'+': '.-.-.',
	'-': '-....-',
	_: '..--.-',
	'"': '.-..-.',
	$: '...-..-',
	'@': '.--.-.',
};

const FROM_MORSE: Record<string, string> = Object.fromEntries(
	Object.entries(MORSE).map(([char, code]) => [code, char]),
);

export function encode(text: string): string {
	return text
		.toUpperCase()
		.trim()
		.split(/\s+/)
		.map((word) =>
			[...word]
				.flatMap((char) => MORSE[char] ?? [])
				.join(' '),
		)
		.filter(Boolean)
		.join(' / ');
}

function words(morse: string): string[][] {
	return morse
		.trim()
		.replace(/[·•]/g, '.')
		.replace(/[–—_]/g, '-')
		.split(/\s*\/\s*|\s{3,}/)
		.map((word) => word.split(/\s+/).filter(Boolean))
		.filter((word) => word.length);
}

export function decode(morse: string): string {
	return words(morse)
		.map((word) =>
			word.map((code) => FROM_MORSE[code] ?? '�').join(''),
		)
		.join(' ');
}

export function looksLikeMorse(text: string): boolean {
	return /^[.·•\-–—_/]+$/.test(text.replace(/\s/g, ''));
}

export interface Timing {
	on: boolean;
	ms: number;
}

// paris: 50 units/word
export function timings(morse: string, wpm: number): Timing[] {
	const unit = 1200 / wpm;
	const out: Timing[] = [];
	words(morse).forEach((word, w) => {
		if (w) out.push({ on: false, ms: 7 * unit });
		word.forEach((code, c) => {
			if (c) out.push({ on: false, ms: 3 * unit });
			[...code].forEach((symbol, s) => {
				if (s) out.push({ on: false, ms: unit });
				out.push({
					on: true,
					ms: (symbol === '-' ? 3 : 1) * unit,
				});
			});
		});
	});
	return out;
}
