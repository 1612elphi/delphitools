// ! guarded by bounds checks
import {
	arpabetToShavian,
	arpabetToIpa,
	normalizeArpabet,
} from './phoneme-map';
import { getAlternatives, type Alternative } from './alternatives';
import { heuristicTransliterate } from './heuristic';

export interface Phoneme {
	shavian: string;
	ipa: string;
	arpabet?: string;
	alternatives: Alternative[];
}

export interface GlossWord {
	latin: string;
	phonemes: Phoneme[];
	shavian: string;
	ipa: string;
	source: 'core' | 'full' | 'heuristic';
	marker: 'none' | 'namer' | 'acroring' | 'acroarc';
	userEdited: boolean;
}

export interface GlossToken {
	type: 'word' | 'punctuation' | 'whitespace';
	value: string;
	gloss?: GlossWord;
}

// "hello" → ["HH","AH0","L","OW1"]
export type Dictionary = Map<string, string[]>;

export function markerPrefix(marker: GlossWord['marker']): string {
	switch (marker) {
		case 'namer':
			return '·';
		case 'acroring':
			return '⸰';
		case 'acroarc':
			return '꤮';
		default:
			return '';
	}
}

export function nextMarker(marker: GlossWord['marker']): GlossWord['marker'] {
	switch (marker) {
		case 'none':
			return 'namer';
		case 'namer':
			return 'acroring';
		case 'acroring':
			return 'acroarc';
		case 'acroarc':
			return 'none';
	}
}

// mutated as tiers load
let coreDictionary: Dictionary = new Map();
let fullDictionary: Dictionary = new Map();

export function setCoreDictionary(dict: Dictionary) {
	coreDictionary = dict;
}

export function setFullDictionary(dict: Dictionary) {
	fullDictionary = dict;
}

// shavian.info rule 2
const SHORTHANDS: Map<string, { shavian: string; ipa: string }> = new Map([
	['the', { shavian: '𐑞', ipa: 'ðə' }],
	['of', { shavian: '𐑝', ipa: 'əv' }],
	['and', { shavian: '𐑯', ipa: 'ənd' }],
	['to', { shavian: '𐑑', ipa: 'tuː' }],
	['for', { shavian: '𐑓', ipa: 'fɔːr' }],
]);

// cmu deviates from shavian spelling
const ARPABET_OVERRIDES: Map<string, { from: string; to: string }[]> =
	new Map();

// cmu lot, shavian palm
for (const w of [
	'father',
	'rather',
	'lather',
	'calm',
	'palm',
	'psalm',
	'balm',
	'almond',
	'drama',
	'banana',
	'llama',
	'mama',
	'papa',
	'lava',
	'java',
	'guava',
	'rajah',
	'hurrah',
	'aha',
	'bah',
	'salami',
	'safari',
	'tsunami',
	'khaki',
	'spa',
	'bra',
	'pasta',
	'plaza',
	'taco',
	'cantata',
	'sonata',
	'aria',
]) {
	ARPABET_OVERRIDES.set(w, [{ from: 'AA', to: 'AA_PALM' }]);
}

// cmu lot for thought
for (const w of ['caught', 'bought', 'raw', 'spawn', 'cause']) {
	ARPABET_OVERRIDES.set(w, [{ from: 'AA', to: 'AO' }]);
}

function applyArpabetOverrides(word: string, arpabets: string[]): string[] {
	const overrides = ARPABET_OVERRIDES.get(word.toLowerCase());
	if (!overrides) return arpabets;
	return arpabets.map((code) => {
		const base = normalizeArpabet(code);
		const override = overrides.find((o) => o.from === base);
		return override ? override.to : code;
	});
}

function dictionaryLookup(
	word: string,
): { arpabets: string[]; source: 'core' | 'full' } | null {
	const lower = word.toLowerCase();
	const core = coreDictionary.get(lower);
	if (core) return { arpabets: core, source: 'core' };
	const full = fullDictionary.get(lower);
	if (full) return { arpabets: full, source: 'full' };
	return null;
}

function mergeArpabetSequences(arpabets: string[]): string[] {
	const result: string[] = [];
	let i = 0;
	while (i < arpabets.length) {
		// y+uw=yew
		if (
			arpabets[i] === 'Y' &&
			i + 1 < arpabets.length &&
			normalizeArpabet(arpabets[i + 1]!) === 'UW'
		) {
			result.push('YUW');
			i += 2;
		} else {
			result.push(arpabets[i]!);
			i++;
		}
	}
	return result;
}

function arpabetToPhonemes(arpabets: string[]): Phoneme[] {
	const merged = mergeArpabetSequences(arpabets);
	return merged.map((code) => {
		const normalized = normalizeArpabet(code);
		const shavian = arpabetToShavian(code) ?? '?';
		const ipa = arpabetToIpa(code) ?? '?';
		return {
			shavian,
			ipa,
			arpabet: normalized,
			alternatives: getAlternatives(shavian),
		};
	});
}

// namer dots manual only
function transliterateWord(word: string): GlossWord {
	const shorthand = SHORTHANDS.get(word.toLowerCase());
	if (shorthand) {
		const phoneme: Phoneme = {
			shavian: shorthand.shavian,
			ipa: shorthand.ipa,
			alternatives: getAlternatives(shorthand.shavian),
		};
		return {
			latin: word,
			phonemes: [phoneme],
			shavian: shorthand.shavian,
			ipa: shorthand.ipa,
			source: 'core',
			marker: 'none',
			userEdited: false,
		};
	}

	const lookup = dictionaryLookup(word);
	let phonemes: Phoneme[];
	let source: GlossWord['source'];

	if (lookup) {
		const corrected = applyArpabetOverrides(word, lookup.arpabets);
		phonemes = arpabetToPhonemes(corrected);
		source = lookup.source;
	} else {
		const heuristic = heuristicTransliterate(word);
		phonemes = heuristic.map((h) => ({
			shavian: h.shavian,
			ipa: h.ipa,
			alternatives: getAlternatives(h.shavian),
		}));
		source = 'heuristic';
	}

	return {
		latin: word,
		phonemes,
		shavian: phonemes.map((p) => p.shavian).join(''),
		ipa: phonemes.map((p) => p.ipa).join(''),
		source,
		marker: 'none' as const,
		userEdited: false,
	};
}

export function tokenise(text: string): GlossToken[] {
	const tokens: GlossToken[] = [];
	const regex = /([a-zA-Z']+)|(\s+)|([^\sa-zA-Z']+)/g;
	let match: RegExpExecArray | null;

	while ((match = regex.exec(text)) !== null) {
		if (match[1]) {
			const gloss = transliterateWord(match[1]);
			tokens.push({ type: 'word', value: match[1], gloss });
		} else if (match[2]) {
			tokens.push({ type: 'whitespace', value: match[2] });
		} else if (match[3]) {
			tokens.push({ type: 'punctuation', value: match[3] });
		}
	}

	return tokens;
}

// after tier 2 load
export function reResolveTokens(tokens: GlossToken[]): GlossToken[] {
	return tokens.map((token) => {
		if (token.type !== 'word' || !token.gloss) return token;
		if (token.gloss.userEdited) return token;
		if (token.gloss.source !== 'heuristic') return token;

		const lookup = dictionaryLookup(token.gloss.latin);
		if (!lookup) return token;

		const corrected = applyArpabetOverrides(
			token.gloss.latin,
			lookup.arpabets,
		);
		const phonemes = arpabetToPhonemes(corrected);
		const prefix = markerPrefix(token.gloss.marker);

		return {
			...token,
			gloss: {
				...token.gloss,
				phonemes,
				shavian:
					prefix +
					phonemes.map((p) => p.shavian).join(''),
				ipa: phonemes.map((p) => p.ipa).join(''),
				source: lookup.source,
			},
		};
	});
}
