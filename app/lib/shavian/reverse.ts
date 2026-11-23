import { spellingOf, type Dictionary } from './transliterate';

/** Shavian spelling to the English words spelled that way, most common first. */
export type ReverseIndex = Map<string, string[]>;

export interface ReverseToken {
	/** The Shavian word as typed, or the text between words. */
	source: string;
	/** English words this spelling can be; empty for an unknown word and for text between words. */
	candidates: string[];
	latin: string;
}

/** `core` is in frequency order and ranks first; the rest of `full` follows in alphabetical order. */
export function reverseIndex(core: Dictionary, full: Dictionary): ReverseIndex {
	const index: ReverseIndex = new Map();
	const add = (word: string, arpabets: string[]) => {
		const spelling = spellingOf(word, arpabets);
		if (!spelling) return;
		const words = index.get(spelling);
		if (words) words.push(word);
		else index.set(spelling, [word]);
	};
	for (const [word, arpabets] of core) add(word, arpabets);
	for (const [word, arpabets] of full)
		if (!core.has(word)) add(word, arpabets);
	return index;
}

// namer dot, acroring, acroarc, then shavian letters
const WORD = /([·⸰꤮]?)([\u{10450}-\u{1047F}]+)/gu;

const capital = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);

/**
 * English for Shavian text. `picks` maps a token position to the candidate
 * chosen for it. A namer dot capitalises, an acronym marker upper-cases, and
 * so does the start of a sentence.
 */
export function toLatin(
	text: string,
	index: ReverseIndex,
	picks: ReadonlyMap<number, number> = new Map(),
): ReverseToken[] {
	const tokens: ReverseToken[] = [];
	const between = (source: string) => {
		if (source)
			tokens.push({ source, candidates: [], latin: source });
	};
	let last = 0;
	let opens = true;
	for (const match of text.matchAll(WORD)) {
		const gap = text.slice(last, match.index);
		between(gap);
		if (/[.!?]\s*$/.test(gap)) opens = true;
		const [source, marker, letters] = match;
		const candidates = index.get(letters!) ?? [];
		const pick = picks.get(tokens.length) ?? 0;
		let latin =
			candidates[pick % (candidates.length || 1)] ?? source;
		if (candidates.length) {
			if (marker === '⸰' || marker === '꤮')
				latin = latin.toUpperCase();
			else if (marker || opens || latin === 'i')
				latin = capital(latin);
		}
		tokens.push({ source, candidates, latin });
		opens = false;
		last = match.index + source.length;
	}
	between(text.slice(last));
	return tokens;
}
