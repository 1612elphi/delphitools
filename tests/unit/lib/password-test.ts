import { module, test } from 'qunit';
import {
	AMBIGUOUS_CHARS,
	CHARSET_DIGITS,
	CHARSET_LOWERCASE,
	CHARSET_SYMBOLS,
	CHARSET_UPPERCASE,
	buildCharset,
	buildPassphrase,
	charKind,
	generatePassword,
	parseWordlist,
	passphraseEntropy,
	passwordEntropy,
	randomIndex,
	strengthBand,
	type IntSource,
} from 'delphitools-v2/lib/password';

const ALL_ON = {
	lowercase: true,
	uppercase: true,
	digits: true,
	symbols: true,
	excludeAmbiguous: false,
};

function scripted(values: number[]): { next: IntSource; draws: () => number } {
	let i = 0;
	return {
		next: () => values[i++ % values.length]!,
		draws: () => i,
	};
}

module('Unit | Lib | password', function () {
	test('buildCharset assembles the enabled classes in order', function (assert) {
		assert.strictEqual(
			buildCharset({
				...ALL_ON,
				uppercase: false,
				symbols: false,
			}),
			CHARSET_LOWERCASE + CHARSET_DIGITS,
		);
		assert.strictEqual(
			buildCharset(ALL_ON),
			CHARSET_LOWERCASE +
				CHARSET_UPPERCASE +
				CHARSET_DIGITS +
				CHARSET_SYMBOLS,
		);
		assert.strictEqual(
			buildCharset({ ...ALL_ON, lowercase: false }),
			CHARSET_UPPERCASE + CHARSET_DIGITS + CHARSET_SYMBOLS,
			'the lowercase class alone leaves no gap',
		);
	});

	test('buildCharset drops lookalikes when told to', function (assert) {
		const pool = buildCharset({
			...ALL_ON,
			excludeAmbiguous: true,
		});
		for (const char of AMBIGUOUS_CHARS) {
			assert.false(
				pool.includes(char),
				`no ${char} in the pool`,
			);
		}
		assert.strictEqual(
			pool,
			[
				...(CHARSET_LOWERCASE +
					CHARSET_UPPERCASE +
					CHARSET_DIGITS +
					CHARSET_SYMBOLS),
			]
				.filter(
					(char) =>
						!AMBIGUOUS_CHARS.includes(char),
				)
				.join(''),
		);
	});

	test('buildCharset throws with every class off', function (assert) {
		assert.throws(() =>
			buildCharset({
				...ALL_ON,
				lowercase: false,
				uppercase: false,
				digits: false,
				symbols: false,
			}),
		);
	});

	test('generatePassword output belongs to the selected classes only', function (assert) {
		const cases = [
			{ ...ALL_ON, digits: false, symbols: false },
			{ ...ALL_ON, lowercase: false, symbols: false },
			{ ...ALL_ON, lowercase: false, uppercase: false },
			{
				...ALL_ON,
				lowercase: false,
				uppercase: false,
				digits: false,
			},
			ALL_ON,
		];
		for (const spec of cases) {
			const pool = new Set(buildCharset(spec));
			for (let run = 0; run < 30; run++) {
				const out = generatePassword({
					...spec,
					length: 24,
				});
				assert.strictEqual(out.length, 24);
				const strays = [...out].filter(
					(char) => !pool.has(char),
				);
				assert.deepEqual(
					strays,
					[],
					`no strays for ${JSON.stringify(spec)}`,
				);
			}
		}
	});

	test('generatePassword exclusion holds across many draws', function (assert) {
		const spec = { ...ALL_ON, excludeAmbiguous: true, length: 64 };
		for (let run = 0; run < 50; run++) {
			const out = generatePassword(spec);
			for (const char of AMBIGUOUS_CHARS) {
				assert.false(
					out.includes(char),
					`${char} never appears`,
				);
			}
		}
	});

	test('generatePassword clamps the length', function (assert) {
		assert.strictEqual(
			generatePassword({ ...ALL_ON, length: 1 }).length,
			8,
		);
		assert.strictEqual(
			generatePassword({ ...ALL_ON, length: 999 }).length,
			128,
		);
	});

	test('randomIndex rejects draws past the largest multiple', function (assert) {
		// limit 200: 255 and 200 refused
		const source = scripted([255, 200, 7]);
		assert.strictEqual(randomIndex(100, 256, source.next), 7);
		assert.strictEqual(
			source.draws(),
			3,
			'two rejected draws, one accepted',
		);
	});

	test('randomIndex shows no modulo skew over a large draw', function (assert) {
		// 256 mod 100 = 56: naive modulo biases 0..55
		const source = scripted(
			Array.from({ length: 256 }, (_, i) => i),
		);
		const buckets = new Map<number, number>();
		const samples = 100_000;
		for (let i = 0; i < samples; i++) {
			const index = randomIndex(100, 256, source.next);
			buckets.set(index, (buckets.get(index) ?? 0) + 1);
		}
		assert.strictEqual(buckets.size, 100, 'every index was hit');
		for (const [index, count] of buckets) {
			assert.strictEqual(
				count,
				samples / 100,
				`index ${index} uniform`,
			);
		}
		assert.true(
			source.draws() > samples,
			'rejections happened — the naive path would not need them',
		);
	});

	test('passwordEntropy is length times log2 of the pool', function (assert) {
		assert.strictEqual(passwordEntropy(16, 94), 16 * Math.log2(94));
		assert.strictEqual(passwordEntropy(0, 94), 0);
		assert.strictEqual(
			passwordEntropy(16, 1),
			0,
			'one outcome carries no bits',
		);
	});

	test('passphraseEntropy counts the trailing digit exactly', function (assert) {
		const base = 5 * Math.log2(7776);
		assert.strictEqual(passphraseEntropy(5, 7776, false), base);
		assert.strictEqual(
			passphraseEntropy(5, 7776, true),
			base + Math.log2(10),
		);
	});

	test('strengthBand steps at its thresholds', function (assert) {
		assert.strictEqual(strengthBand(0), 'Weak');
		assert.strictEqual(strengthBand(39.9), 'Weak');
		assert.strictEqual(strengthBand(40), 'Fair');
		assert.strictEqual(strengthBand(59.9), 'Fair');
		assert.strictEqual(strengthBand(60), 'Strong');
		assert.strictEqual(strengthBand(94.9), 'Strong');
		assert.strictEqual(strengthBand(95), 'Very strong');
	});

	test('parseWordlist strips dice numbers and skips junk', function (assert) {
		const words = parseWordlist(
			'11111\tabacus\n11112\tAbdomen\n\nbanana\n42x notaword\n11113\théllo',
		);
		assert.deepEqual(words, ['abacus', 'abdomen', 'banana']);
	});

	test('buildPassphrase picks, separates and decorates deterministically', function (assert) {
		const words = ['apple', 'banana', 'cherry', 'durian'];
		// 2^32 % 4 = 0: values map straight through
		const source = scripted([1, 2, 0, 3]);
		assert.strictEqual(
			buildPassphrase(
				words,
				{
					words: 3,
					separator: '-',
					capitaliseFirst: false,
					trailingDigit: true,
				},
				source.next,
			),
			'banana-cherry-apple3',
		);
	});

	test('buildPassphrase capitalises the first word only', function (assert) {
		const words = ['apple', 'banana', 'cherry'];
		const source = scripted([0, 1, 2]);
		assert.strictEqual(
			buildPassphrase(
				words,
				{
					words: 3,
					separator: ' ',
					capitaliseFirst: true,
					trailingDigit: false,
				},
				source.next,
			),
			'Apple banana cherry',
		);
	});

	test('buildPassphrase clamps the word count and rejects an empty list', function (assert) {
		const words = [
			'a',
			'b',
			'c',
			'd',
			'e',
			'f',
			'g',
			'h',
			'i',
			'j',
			'k',
		];
		const flat: IntSource = () => 0;
		const spec = {
			words: 3,
			separator: '.',
			capitaliseFirst: false,
			trailingDigit: false,
		};
		assert.strictEqual(
			buildPassphrase(
				words,
				{ ...spec, words: 1 },
				flat,
			).split('.').length,
			3,
		);
		assert.strictEqual(
			buildPassphrase(
				words,
				{ ...spec, words: 30 },
				flat,
			).split('.').length,
			10,
		);
		assert.throws(() => buildPassphrase([], spec, flat));
	});

	test('buildPassphrase words all come from the injected list', function (assert) {
		// 3 base-26 letters, unique over 500
		const letters = (n: number) =>
			String.fromCharCode(97 + (n % 26)) +
			String.fromCharCode(97 + (Math.floor(n / 26) % 26)) +
			String.fromCharCode(97 + (Math.floor(n / 676) % 26));
		const wordlist = parseWordlist(
			Array.from(
				{ length: 500 },
				(_, i) => `${11111 + i}\t${letters(i)}`,
			).join('\n'),
		);
		const pool = new Set(wordlist);
		for (let run = 0; run < 20; run++) {
			const phrase = buildPassphrase(wordlist, {
				words: 6,
				separator: '-',
				capitaliseFirst: true,
				trailingDigit: true,
			});
			const parts = phrase.split('-');
			assert.strictEqual(parts.length, 6);
			const tail = parts[5]!;
			assert.true(
				/[0-9]$/.test(tail),
				'trailing digit appended',
			);
			parts.forEach((part, index) => {
				const bare =
					index === 5 ? part.slice(0, -1) : part;
				const word =
					index === 0
						? bare.charAt(0).toLowerCase() +
							bare.slice(1)
						: bare;
				assert.true(
					pool.has(word),
					`${bare} (as ${word}) is in the list`,
				);
			});
		}
	});
});

module('Unit | Lib | password > charKind', function () {
	test('digits classify as digit', function (assert) {
		for (const ch of CHARSET_DIGITS) {
			assert.strictEqual(charKind(ch), 'digit', ch);
		}
	});

	test('the pragmatic symbol set classifies as symbol', function (assert) {
		for (const ch of CHARSET_SYMBOLS) {
			assert.strictEqual(charKind(ch), 'symbol', ch);
		}
	});

	test('letters and unset fallback classify as letter', function (assert) {
		for (const ch of CHARSET_LOWERCASE + CHARSET_UPPERCASE) {
			assert.strictEqual(charKind(ch), 'letter', ch);
		}
		// space separator is neither lookup
		assert.strictEqual(charKind(' '), 'letter');
	});
});
