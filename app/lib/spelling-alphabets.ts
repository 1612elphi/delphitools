export interface SpellingAlphabet {
	id: string;
	label: string;
	words: Record<string, string>;
}

export interface SpelledChar {
	char: string;
	word: string | null;
}

const DIGITS_DE = {
	'0': 'Null',
	'1': 'Eins',
	'2': 'Zwei',
	'3': 'Drei',
	'4': 'Vier',
	'5': 'Fünf',
	'6': 'Sechs',
	'7': 'Sieben',
	'8': 'Acht',
	'9': 'Neun',
};

export const ALPHABETS: SpellingAlphabet[] = [
	{
		id: 'nato',
		label: 'NATO',
		// ponytail: the spelled forms; ICAO's pronunciations Tree, Fife and
		// Niner for 3, 5 and 9 are not represented.
		words: {
			A: 'Alfa',
			B: 'Bravo',
			C: 'Charlie',
			D: 'Delta',
			E: 'Echo',
			F: 'Foxtrot',
			G: 'Golf',
			H: 'Hotel',
			I: 'India',
			J: 'Juliett',
			K: 'Kilo',
			L: 'Lima',
			M: 'Mike',
			N: 'November',
			O: 'Oscar',
			P: 'Papa',
			Q: 'Quebec',
			R: 'Romeo',
			S: 'Sierra',
			T: 'Tango',
			U: 'Uniform',
			V: 'Victor',
			W: 'Whiskey',
			X: 'X-ray',
			Y: 'Yankee',
			Z: 'Zulu',
			'0': 'Zero',
			'1': 'One',
			'2': 'Two',
			'3': 'Three',
			'4': 'Four',
			'5': 'Five',
			'6': 'Six',
			'7': 'Seven',
			'8': 'Eight',
			'9': 'Nine',
		},
	},
	{
		id: 'din5009',
		label: 'DIN 5009',
		// DIN 5009:2022-06, the city-name table.
		words: {
			A: 'Aachen',
			B: 'Berlin',
			C: 'Chemnitz',
			D: 'Düsseldorf',
			E: 'Essen',
			F: 'Frankfurt',
			G: 'Goslar',
			H: 'Hamburg',
			I: 'Ingelheim',
			J: 'Jena',
			K: 'Köln',
			L: 'Leipzig',
			M: 'München',
			N: 'Nürnberg',
			O: 'Offenbach',
			P: 'Potsdam',
			Q: 'Quickborn',
			R: 'Rostock',
			S: 'Salzwedel',
			T: 'Tübingen',
			U: 'Unna',
			V: 'Völklingen',
			W: 'Wuppertal',
			X: 'Xanten',
			Y: 'Ypsilon',
			Z: 'Zwickau',
			Ä: 'Umlaut Aachen',
			Ö: 'Umlaut Offenbach',
			Ü: 'Umlaut Unna',
			ß: 'Eszett',
			...DIGITS_DE,
		},
	},
	{
		id: 'german',
		label: 'German (1996)',
		// DIN 5009:1996-12, the table the 2022 edition replaced.
		words: {
			A: 'Anton',
			B: 'Berta',
			C: 'Cäsar',
			D: 'Dora',
			E: 'Emil',
			F: 'Friedrich',
			G: 'Gustav',
			H: 'Heinrich',
			I: 'Ida',
			J: 'Julius',
			K: 'Kaufmann',
			L: 'Ludwig',
			M: 'Martha',
			N: 'Nordpol',
			O: 'Otto',
			P: 'Paula',
			Q: 'Quelle',
			R: 'Richard',
			S: 'Samuel',
			T: 'Theodor',
			U: 'Ulrich',
			V: 'Viktor',
			W: 'Wilhelm',
			X: 'Xanthippe',
			Y: 'Ypsilon',
			Z: 'Zacharias',
			Ä: 'Ärger',
			Ö: 'Ökonom',
			Ü: 'Übermut',
			ß: 'Eszett',
			...DIGITS_DE,
		},
	},
];

const isSpace = (char: string) => /\s/.test(char);

export function spell(text: string, alphabet: SpellingAlphabet): SpelledChar[] {
	// 'ß'.toUpperCase() is 'SS', so the raw character is tried first.
	return [...text].map((char) => ({
		char,
		word:
			alphabet.words[char] ??
			alphabet.words[char.toUpperCase()] ??
			null,
	}));
}

export function spellText(text: string, alphabet: SpellingAlphabet): string {
	return spell(text, alphabet)
		.map(({ char, word }) => word ?? (isSpace(char) ? '/' : char))
		.join(' ');
}

// Lower-cased and hyphen-free, so X-ray and Xray read the same.
const key = (word: string) => word.toLowerCase().replace(/-/g, '');

function reverse(alphabet: SpellingAlphabet): Map<string, string> {
	const map = new Map<string, string>([['/', ' ']]);
	for (const [char, word] of Object.entries(alphabet.words))
		map.set(key(word), char);
	return map;
}

/** Each whitespace-separated token as the character it names, or as itself. */
function read(
	text: string,
	alphabet: SpellingAlphabet,
): { value: string; known: boolean }[] {
	const map = reverse(alphabet);
	const tokens = text.split(/\s+/).filter(Boolean);
	const out: { value: string; known: boolean }[] = [];
	for (let i = 0; i < tokens.length; i++) {
		const pair = map.get(
			key(`${tokens[i]} ${tokens[i + 1] ?? ''}`),
		);
		if (pair !== undefined) {
			out.push({ value: pair, known: true });
			i++;
			continue;
		}
		const single = map.get(key(tokens[i]!));
		out.push({
			value: single ?? tokens[i]!,
			known: single !== undefined,
		});
	}
	return out;
}

export function unspell(words: string, alphabet: SpellingAlphabet): string {
	return read(words, alphabet)
		.map((token) => token.value)
		.join('');
}

export function looksSpelled(
	text: string,
	alphabet: SpellingAlphabet,
): boolean {
	const tokens = read(text, alphabet);
	return (
		text.trim().split(/\s+/).length >= 2 &&
		tokens.every((token) => token.known)
	);
}
