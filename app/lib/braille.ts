// Uncontracted (Grade 1) braille, one cell per character. Indicators and
// punctuation follow the Rules of Unified English Braille (ICEB, 2013):
// §6 numeric mode, §7 punctuation, §8 capitalisation.
// ponytail: no Grade 2 / UEB contractions; the upgrade path is a contraction
// pass over each word ahead of the per-character lookup in toBraille.

const BLANK = 0x2800;

function cell(dots: string): string {
	let mask = 0;
	for (const dot of dots) mask |= 1 << (Number(dot) - 1);
	return String.fromCharCode(BLANK + mask);
}

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS = '1234567890';
const CELLS = (
	'1 12 14 145 15 124 1245 125 24 245 13 123 134 1345 135 1234 12345 ' +
	'1235 234 2345 136 1236 2456 1346 13456 1356'
)
	.split(' ')
	.map(cell);
const LETTER_OF = new Map(CELLS.map((c, i) => [c, LETTERS[i]!]));

const PUNCTUATION: Record<string, string> = {
	',': '2',
	';': '23',
	':': '25',
	'.': '256',
	'!': '235',
	'?': '236',
	"'": '3',
	'-': '36',
	'(': '5 126',
	')': '5 345',
	'/': '456 34',
};
const PUNCT_CELLS = new Map(
	Object.entries(PUNCTUATION).map(([char, dots]) => [
		char,
		dots.split(' ').map(cell).join(''),
	]),
);
const PUNCT_OF = new Map([...PUNCT_CELLS].map(([char, c]) => [c, char]));

const CAPITAL = cell('6');
const NUMBER = cell('3456');
const GRADE1 = cell('56');
// UEB §7.6: the opening quote shares a cell with the question mark; position
// in the word decides which it is.
const OPEN_QUOTE = cell('236');
const CLOSE_QUOTE = cell('356');

const atWordStart = (out: string) => !out || /\s$/.test(out);

export function toBraille(text: string): string {
	let out = '';
	let numeric = false;
	for (const [token] of text.matchAll(/[A-Za-z]+|[0-9]+|./gsu)) {
		if (/^[0-9]/.test(token)) {
			if (!numeric) out += NUMBER;
			numeric = true;
			for (const digit of token)
				out += CELLS[DIGITS.indexOf(digit)]!;
			continue;
		}
		if (/^[A-Za-z]/.test(token)) {
			// UEB §6.5.1: a–j straight after a number would read as digits
			if (numeric && /^[A-Ja-j]/.test(token)) out += GRADE1;
			numeric = false;
			const capsWord =
				token.length > 1 &&
				token === token.toUpperCase();
			if (capsWord) out += CAPITAL + CAPITAL;
			for (const char of token) {
				const lower = char.toLowerCase();
				if (!capsWord && char !== lower) out += CAPITAL;
				out += CELLS[LETTERS.indexOf(lower)]!;
			}
			continue;
		}
		// UEB §6.2: numeric mode continues through a decimal point or comma
		numeric = numeric && (token === '.' || token === ',');
		if (token === '"')
			out += atWordStart(out) ? OPEN_QUOTE : CLOSE_QUOTE;
		else out += PUNCT_CELLS.get(token) ?? token;
	}
	return out;
}

export function fromBraille(cells: string): string {
	const chars = [...cells];
	let out = '';
	let numeric = false;
	let capsWord = false;
	let capsNext = false;
	for (let i = 0; i < chars.length; i++) {
		const c = chars[i]!;
		if (c === CAPITAL) {
			if (chars[i + 1] === CAPITAL) {
				capsWord = true;
				i++;
			} else capsNext = true;
			continue;
		}
		if (c === NUMBER) {
			numeric = true;
			continue;
		}
		if (c === GRADE1) {
			numeric = false;
			continue;
		}
		const letter = LETTER_OF.get(c);
		if (letter) {
			const index = LETTERS.indexOf(letter);
			if (numeric && index < 10) {
				out += DIGITS[index]!;
				continue;
			}
			numeric = false;
			out +=
				capsNext || capsWord
					? letter.toUpperCase()
					: letter;
			capsNext = false;
			continue;
		}
		capsWord = false;
		const pair = PUNCT_OF.get(c + (chars[i + 1] ?? ''));
		if (pair) {
			out += pair;
			i++;
			numeric = false;
			continue;
		}
		if (c === OPEN_QUOTE) {
			out += atWordStart(out) ? '"' : '?';
			numeric = false;
			continue;
		}
		if (c === CLOSE_QUOTE) {
			out += '"';
			numeric = false;
			continue;
		}
		const punct = PUNCT_OF.get(c) ?? c;
		numeric = numeric && (punct === '.' || punct === ',');
		out += punct;
	}
	return out;
}

export const looksLikeBraille = (text: string) => /[\u2800-\u28ff]/.test(text);

/** Dot numbers of one cell, "1-3-5"; "" for the blank cell or a non-cell. */
export function dots(pattern: string): string {
	const mask = (pattern.codePointAt(0) ?? 0) - BLANK;
	if (mask <= 0 || mask > 0xff) return '';
	return [1, 2, 3, 4, 5, 6, 7, 8]
		.filter((dot) => mask & (1 << (dot - 1)))
		.join('-');
}
