import type { Dictionary } from 'delphitools-v2/lib/shavian/transliterate';

export type RhymeMode = 'perfect' | 'near';

export type RhymeIndex = Map<string, string[]>;

export interface RhymeGroup {
	syllables: number;
	words: string[];
}

const isVowel = (phone: string) => /\d$/.test(phone);

export const syllablesOf = (phones: string[]) => phones.filter(isVowel).length;

// arpabet stress digits: 1 primary, 2 secondary, 0 none
function tail(phones: string[]): string[] {
	for (const stress of ['1', '2', '0'])
		for (let i = phones.length - 1; i >= 0; i--)
			if (phones[i]!.endsWith(stress)) return phones.slice(i);
	return [];
}

/** Same key means the words rhyme: perfect compares every sound from the stressed vowel on, near compares only the vowels. */
export function rhymeKey(phones: string[], mode: RhymeMode): string {
	const sounds = tail(phones);
	return (mode === 'near' ? sounds.filter(isVowel) : sounds)
		.map((phone) => phone.replace(/\d$/, ''))
		.join(' ');
}

export function indexRhymes(
	dictionary: Dictionary,
	mode: RhymeMode,
): RhymeIndex {
	const index: RhymeIndex = new Map();
	for (const [word, phones] of dictionary) {
		const key = rhymeKey(phones, mode);
		if (!key) continue;
		const words = index.get(key);
		if (words) words.push(word);
		else index.set(key, [word]);
	}
	return index;
}

/** Rhymes of `word` grouped by syllable count, `common` words first in each group; null when the word is not in the dictionary. */
export function rhymesFor(
	word: string,
	dictionary: Dictionary,
	index: RhymeIndex,
	mode: RhymeMode,
	common: Dictionary,
): RhymeGroup[] | null {
	const phones = dictionary.get(word);
	if (!phones) return null;
	const groups = new Map<number, string[]>();
	for (const other of index.get(rhymeKey(phones, mode)) ?? []) {
		if (other === word) continue;
		const count = syllablesOf(dictionary.get(other)!);
		const words = groups.get(count);
		if (words) words.push(other);
		else groups.set(count, [other]);
	}
	const rank = (w: string) => (common.has(w) ? 0 : 1);
	return [...groups]
		.sort(([a], [b]) => a - b)
		.map(([syllables, words]) => ({
			syllables,
			words: words.sort(
				(a, b) =>
					rank(a) - rank(b) || a.localeCompare(b),
			),
		}));
}

const indexes = new WeakMap<Dictionary, Map<RhymeMode, RhymeIndex>>();

/** `indexRhymes`, built once per dictionary and mode. */
export function rhymeIndex(
	dictionary: Dictionary,
	mode: RhymeMode,
): RhymeIndex {
	let modes = indexes.get(dictionary);
	if (!modes)
		indexes.set(
			dictionary,
			(modes = new Map<RhymeMode, RhymeIndex>()),
		);
	let index = modes.get(mode);
	if (!index) modes.set(mode, (index = indexRhymes(dictionary, mode)));
	return index;
}
