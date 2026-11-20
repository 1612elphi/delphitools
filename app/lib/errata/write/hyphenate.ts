/** Break offsets inside a word: a hyphen may go before word[i]. */
export type Hyphenator = (word: string) => number[];

export type HyphenLang = 'en' | 'de';

// typesetting minimums
const LEFT = 2;
const RIGHT = 3;
export const MIN_WORD = 5;
const WORD_CACHE = 50_000;

const FILES: Record<HyphenLang, { patterns: string; exceptions?: string }> = {
	en: {
		patterns: 'hyph-en-us.pat.txt',
		exceptions: 'hyph-en-us.hyp.txt',
	},
	de: { patterns: 'hyph-de-1996.pat.txt' },
};

/** A Liang hyphenator from TeX patterns and hyphenated exception words, one per line or space. */
export function buildHyphenator(patterns: string, exceptions = ''): Hyphenator {
	const pats = new Map<string, number[]>();
	let longest = 0;
	for (const p of patterns.split(/\s+/)) {
		if (!p) continue;
		const digits = [0];
		let letters = '';
		for (const ch of p) {
			if (ch >= '0' && ch <= '9')
				digits[digits.length - 1] = Number(ch);
			else {
				letters += ch;
				digits.push(0);
			}
		}
		pats.set(letters, digits);
		longest = Math.max(longest, letters.length);
	}
	const known = new Map<string, number[]>();
	for (const e of exceptions.split(/\s+/)) {
		if (!e) continue;
		const points: number[] = [];
		let n = 0;
		for (const ch of e)
			if (ch === '-') points.push(n);
			else n++;
		known.set(e.replaceAll('-', ''), points);
	}
	const words = new Map<string, number[]>();
	return (word) => {
		const lower = word.toLowerCase();
		if (lower.length !== word.length || word.length < MIN_WORD)
			return [];
		let out = words.get(lower);
		if (out) return out;
		out = known.get(lower);
		if (!out) {
			const w = `.${lower}.`;
			const points = new Array<number>(w.length + 1).fill(0);
			for (let i = 0; i < w.length; i++)
				for (
					let j = i + 1;
					j <= Math.min(w.length, i + longest);
					j++
				) {
					const pat = pats.get(w.slice(i, j));
					if (!pat) continue;
					for (let k = 0; k < pat.length; k++)
						points[i + k] = Math.max(
							points[i + k]!,
							pat[k]!,
						);
				}
			out = [];
			// points offset by dot
			for (let i = LEFT; i <= lower.length - RIGHT; i++)
				if (points[i + 1]! % 2) out.push(i);
		} else
			out = out.filter(
				(i) => i >= LEFT && i <= lower.length - RIGHT,
			);
		if (words.size > WORD_CACHE) words.clear();
		words.set(lower, out);
		return out;
	};
}

const loaded = new Map<HyphenLang, Hyphenator>();
const loading = new Map<HyphenLang, Promise<void>>();

async function fetchText(file: string): Promise<string> {
	const res = await fetch(`/hyphenation/${file}`);
	if (!res.ok) throw new Error(`hyphenation ${file}: ${res.status}`);
	return res.text();
}

/** The hyphenator for lang once ensureHyphenator loaded it. */
export const hyphenatorFor = (lang: HyphenLang): Hyphenator | null =>
	loaded.get(lang) ?? null;

export function ensureHyphenator(lang: HyphenLang): Promise<void> {
	if (loaded.has(lang)) return Promise.resolve();
	let p = loading.get(lang);
	if (!p) {
		const { patterns, exceptions } = FILES[lang];
		p = Promise.all([
			fetchText(patterns),
			exceptions ? fetchText(exceptions) : '',
		]).then(([pat, hyp]) => {
			loaded.set(lang, buildHyphenator(pat, hyp));
		});
		p.catch(() => loading.delete(lang));
		loading.set(lang, p);
	}
	return p;
}
