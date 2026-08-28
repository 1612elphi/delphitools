export interface ShavianLetter {
	shavian: string;
	name: string;
	ipa: string;
	category: 'consonant' | 'vowel' | 'ligature';
}

// 48 letters + ligatures
export const SHAVIAN_LETTERS: ShavianLetter[] = [
	{ shavian: '𐑐', name: 'peep', ipa: 'p', category: 'consonant' },
	{ shavian: '𐑑', name: 'tot', ipa: 't', category: 'consonant' },
	{ shavian: '𐑒', name: 'kick', ipa: 'k', category: 'consonant' },
	{ shavian: '𐑓', name: 'fee', ipa: 'f', category: 'consonant' },
	{ shavian: '𐑔', name: 'thigh', ipa: 'θ', category: 'consonant' },
	{ shavian: '𐑕', name: 'so', ipa: 's', category: 'consonant' },
	{ shavian: '𐑖', name: 'sure', ipa: 'ʃ', category: 'consonant' },
	{ shavian: '𐑗', name: 'church', ipa: 'tʃ', category: 'consonant' },
	{ shavian: '𐑚', name: 'bib', ipa: 'b', category: 'consonant' },
	{ shavian: '𐑛', name: 'dead', ipa: 'd', category: 'consonant' },
	{ shavian: '𐑜', name: 'gag', ipa: 'ɡ', category: 'consonant' },
	{ shavian: '𐑝', name: 'vow', ipa: 'v', category: 'consonant' },
	{ shavian: '𐑞', name: 'they', ipa: 'ð', category: 'consonant' },
	{ shavian: '𐑟', name: 'zoo', ipa: 'z', category: 'consonant' },
	{ shavian: '𐑠', name: 'measure', ipa: 'ʒ', category: 'consonant' },
	{ shavian: '𐑡', name: 'judge', ipa: 'dʒ', category: 'consonant' },
	{ shavian: '𐑘', name: 'yea', ipa: 'j', category: 'consonant' },
	{ shavian: '𐑢', name: 'woe', ipa: 'w', category: 'consonant' },
	{ shavian: '𐑙', name: 'hung', ipa: 'ŋ', category: 'consonant' },
	{ shavian: '𐑣', name: 'ha-ha', ipa: 'h', category: 'consonant' },
	{ shavian: '𐑥', name: 'mime', ipa: 'm', category: 'consonant' },
	{ shavian: '𐑯', name: 'nun', ipa: 'n', category: 'consonant' },
	{ shavian: '𐑤', name: 'loll', ipa: 'l', category: 'consonant' },
	{ shavian: '𐑮', name: 'roar', ipa: 'r', category: 'consonant' },
	{ shavian: '𐑨', name: 'ash', ipa: 'æ', category: 'vowel' },
	{ shavian: '𐑩', name: 'ado', ipa: 'ə', category: 'vowel' },
	{ shavian: '𐑪', name: 'on', ipa: 'ɒ', category: 'vowel' },
	{ shavian: '𐑫', name: 'wool', ipa: 'ʊ', category: 'vowel' },
	{ shavian: '𐑦', name: 'if', ipa: 'ɪ', category: 'vowel' },
	{ shavian: '𐑧', name: 'egg', ipa: 'ɛ', category: 'vowel' },
	{ shavian: '𐑳', name: 'up', ipa: 'ʌ', category: 'vowel' },
	{ shavian: '𐑱', name: 'ate', ipa: 'eɪ', category: 'vowel' },
	{ shavian: '𐑰', name: 'eat', ipa: 'iː', category: 'vowel' },
	{ shavian: '𐑲', name: 'ice', ipa: 'aɪ', category: 'vowel' },
	{ shavian: '𐑴', name: 'oak', ipa: 'oʊ', category: 'vowel' },
	{ shavian: '𐑵', name: 'ooze', ipa: 'uː', category: 'vowel' },
	{ shavian: '𐑶', name: 'oil', ipa: 'ɔɪ', category: 'vowel' },
	{ shavian: '𐑬', name: 'out', ipa: 'aʊ', category: 'vowel' },
	{ shavian: '𐑷', name: 'awe', ipa: 'ɔː', category: 'vowel' },
	{ shavian: '𐑸', name: 'are', ipa: 'ɑːr', category: 'vowel' },
	{ shavian: '𐑹', name: 'or', ipa: 'ɔːr', category: 'vowel' },
	{ shavian: '𐑺', name: 'air', ipa: 'ɛər', category: 'vowel' },
	{ shavian: '𐑻', name: 'err', ipa: 'ɜːr', category: 'vowel' },
	{ shavian: '𐑼', name: 'array', ipa: 'ɚ', category: 'vowel' },
	{ shavian: '𐑽', name: 'ear', ipa: 'ɪər', category: 'vowel' },
	{ shavian: '𐑾', name: 'ian', ipa: 'ɪə', category: 'vowel' },
	{ shavian: '𐑿', name: 'yew', ipa: 'juː', category: 'vowel' },
];

// vowels carry stress digits
const ARPABET_TO_SHAVIAN: Record<string, string> = {
	P: '𐑐',
	T: '𐑑',
	K: '𐑒',
	F: '𐑓',
	TH: '𐑔',
	S: '𐑕',
	SH: '𐑖',
	CH: '𐑗',
	B: '𐑚',
	D: '𐑛',
	G: '𐑜',
	V: '𐑝',
	DH: '𐑞',
	Z: '𐑟',
	ZH: '𐑠',
	JH: '𐑡',
	Y: '𐑘',
	W: '𐑢',
	NG: '𐑙',
	HH: '𐑣',
	M: '𐑥',
	N: '𐑯',
	L: '𐑤',
	R: '𐑮',
	AE: '𐑨',
	AH0: '𐑩',
	AH: '𐑳',
	AA: '𐑪',
	AA_PALM: '𐑭',
	UH: '𐑫',
	IH: '𐑦',
	EH: '𐑧',
	EY: '𐑱',
	IY: '𐑰',
	IY0: '𐑦',
	AY: '𐑲',
	OW: '𐑴',
	UW: '𐑵',
	OY: '𐑶',
	AW: '𐑬',
	AO: '𐑷',
	ER: '𐑼',
	YUW: '𐑿',
};

const ARPABET_TO_IPA: Record<string, string> = {
	P: 'p',
	T: 't',
	K: 'k',
	F: 'f',
	TH: 'θ',
	S: 's',
	SH: 'ʃ',
	CH: 'tʃ',
	B: 'b',
	D: 'd',
	G: 'ɡ',
	V: 'v',
	DH: 'ð',
	Z: 'z',
	ZH: 'ʒ',
	JH: 'dʒ',
	Y: 'j',
	W: 'w',
	NG: 'ŋ',
	HH: 'h',
	M: 'm',
	N: 'n',
	L: 'l',
	R: 'r',
	AE: 'æ',
	AH0: 'ə',
	AH: 'ʌ',
	AA: 'ɒ',
	AA_PALM: 'ɑː',
	UH: 'ʊ',
	IH: 'ɪ',
	EH: 'ɛ',
	EY: 'eɪ',
	IY: 'iː',
	IY0: 'i',
	AY: 'aɪ',
	OW: 'oʊ',
	UW: 'uː',
	OY: 'ɔɪ',
	AW: 'aʊ',
	AO: 'ɔː',
	ER: 'ɚ',
	YUW: 'juː',
};

export function normalizeArpabet(code: string): string {
	// ah0=schwa ah=strut
	if (code.startsWith('AH')) {
		return code.endsWith('0') ? 'AH0' : 'AH';
	}
	// iy0=kit iy=fleece
	// shavian rule 11
	if (code.startsWith('IY')) {
		return code.endsWith('0') ? 'IY0' : 'IY';
	}
	return code.replace(/[012]$/, '');
}

export function arpabetToShavian(code: string): string | undefined {
	return ARPABET_TO_SHAVIAN[normalizeArpabet(code)];
}

export function arpabetToIpa(code: string): string | undefined {
	return ARPABET_TO_IPA[normalizeArpabet(code)];
}

export const CONSONANT_GROUPS: string[][] = [
	['𐑐', '𐑚'],
	['𐑑', '𐑛'],
	['𐑒', '𐑜'],
	['𐑓', '𐑝'],
	['𐑔', '𐑞'],
	['𐑕', '𐑟'],
	['𐑖', '𐑠'],
	['𐑗', '𐑡'],
	['𐑥', '𐑯', '𐑙'],
	['𐑤', '𐑮'],
	['𐑘', '𐑢'],
	['𐑣'],
];

export const VOWEL_CHARS: string[] = SHAVIAN_LETTERS.filter(
	(l) => l.category === 'vowel',
).map((l) => l.shavian);

const SHAVIAN_BY_CHAR = new Map<string, ShavianLetter>(
	SHAVIAN_LETTERS.map((l) => [l.shavian, l]),
);

export function getShavianLetter(char: string): ShavianLetter | undefined {
	return SHAVIAN_BY_CHAR.get(char);
}
