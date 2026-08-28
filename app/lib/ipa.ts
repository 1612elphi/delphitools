import { arpabetToIpa } from './shavian/phoneme-map';
import { heuristicTransliterate } from './shavian/heuristic';

/** lowercase word → arpabet phones */
export type Lookup = (word: string) => string[] | undefined;

export type IpaToken =
	| { type: 'word'; value: string; ipa: string; guess: boolean }
	| { type: 'other'; value: string };

const STRESS: Record<string, string> = { 1: 'ˈ', 2: 'ˌ' };
const TOKEN = /[a-zA-Z']+|[^a-zA-Z']+/g;

const isVowel = (phone: string) => /\d$/.test(phone);

// ponytail: maximal onset, every consonant since the previous vowel goes with
// the stressed syllable, so "abstain" gives əˈbsteɪn for əbˈsteɪn; proper
// syllabification (sonority sequencing) is the upgrade.
function wordToIpa(phones: string[]): string {
	const polysyllabic = phones.filter(isVowel).length > 1;
	// cmu compound stress quirk
	const lastPrimary = phones.findLastIndex((p) => p.endsWith('1'));
	let out = '';
	let onset = '';
	phones.forEach((phone, i) => {
		const ipa = arpabetToIpa(phone) ?? '?';
		if (!isVowel(phone)) {
			onset += ipa;
			return;
		}
		const stress =
			phone.endsWith('1') && i !== lastPrimary
				? '2'
				: phone.slice(-1);
		const mark = polysyllabic ? (STRESS[stress] ?? '') : '';
		out += mark + onset + ipa;
		onset = '';
	});
	return out + onset;
}

export function transcribe(text: string, lookup: Lookup): IpaToken[] {
	return (text.match(TOKEN) ?? []).map((value) => {
		if (!/^[a-zA-Z']/.test(value)) return { type: 'other', value };
		const phones = lookup(value.toLowerCase());
		return phones
			? {
					type: 'word',
					value,
					ipa: wordToIpa(phones),
					guess: false,
				}
			: {
					type: 'word',
					value,
					ipa: heuristicTransliterate(value)
						.map((p) => p.ipa)
						.join(''),
					guess: true,
				};
	});
}

export const toText = (tokens: IpaToken[]) =>
	tokens.map((t) => (t.type === 'word' ? t.ipa : t.value)).join('');
