import { CONSONANT_GROUPS, VOWEL_CHARS, getShavianLetter } from './phoneme-map';

export interface Alternative {
	shavian: string;
	name: string;
	ipa: string;
}

const consonantGroupMap = new Map<string, string[]>();
for (const group of CONSONANT_GROUPS) {
	for (const char of group) {
		consonantGroupMap.set(
			char,
			group.filter((c) => c !== char),
		);
	}
}

export function getAlternatives(shavianChar: string): Alternative[] {
	const letter = getShavianLetter(shavianChar);
	if (!letter) return [];

	let candidates: string[];

	if (letter.category === 'vowel') {
		candidates = VOWEL_CHARS.filter((c) => c !== shavianChar);
	} else {
		candidates = consonantGroupMap.get(shavianChar) ?? [];
	}

	return candidates
		.map((c) => {
			const l = getShavianLetter(c);
			if (!l) return null;
			return { shavian: l.shavian, name: l.name, ipa: l.ipa };
		})
		.filter((a): a is Alternative => a !== null);
}
