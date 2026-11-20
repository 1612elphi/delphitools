import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import {
	AMBIGUOUS_CHARS,
	CHARSET_DIGITS,
	CHARSET_LOWERCASE,
	CHARSET_SYMBOLS,
	CHARSET_UPPERCASE,
	buildCharset,
	charKind,
	strengthBand,
	type PassphraseSpec,
	type PasswordSpec,
} from 'delphitools-v2/lib/password';

const BANDS = [40, 60, 95];
const SCALE_END = 128;
const SETTLE = { first: 160, step: 20, wordStep: 100 };
const FRAME_MS = 33;
const PIPS = [
	[4],
	[0, 8],
	[0, 4, 8],
	[0, 2, 6, 8],
	[0, 2, 4, 6, 8],
	[0, 2, 3, 5, 6, 8],
];

const SETS: [keyof PasswordSpec, string][] = [
	['lowercase', CHARSET_LOWERCASE],
	['uppercase', CHARSET_UPPERCASE],
	['digits', CHARSET_DIGITS],
	['symbols', CHARSET_SYMBOLS],
];

export const tint = (char: string) =>
	({
		digit: 'var(--canon-primary)',
		symbol: 'var(--canon-destructive)',
		letter: 'var(--canon-foreground)',
	})[charKind(char)];

export const phraseTint = (char: string) =>
	/\p{L}/u.test(char)
		? 'var(--canon-foreground)'
		: /\d/.test(char)
			? 'var(--canon-primary)'
			: 'var(--canon-muted-foreground)';

const bandColour = (bits: number) =>
	bits < BANDS[0]!
		? 'var(--canon-destructive)'
		: bits < BANDS[1]!
			? 'var(--canon-muted-foreground)'
			: 'var(--canon-primary)';

const pick = (pool: string) =>
	pool.charAt(Math.floor(Math.random() * pool.length));

const roll = () => Math.floor(Math.random() * 6) + 1;

interface PictureSignature {
	Args: {
		text?: string;
		phrase: boolean;
		spec: PasswordSpec;
		phraseSpec: PassphraseSpec;
		rolls?: Map<string, string>;
		bits: number;
		scrambleKey: number;
	};
}

export default class Picture extends Component<PictureSignature> {
	@tracked frame = 0;
	#settle: number[] = [];
	#key?: number;

	#settled(index: number, now: number) {
		return now >= (this.#settle[index] ?? 0);
	}

	get chars() {
		void this.frame;
		const now = performance.now();
		const pool = buildCharset(this.args.spec);
		const chars = [...(this.args.text ?? '')];
		return {
			style: htmlSafe(
				`--pw-count: ${Math.max(chars.length, 1)}`,
			),
			list: chars.map((char, index) => {
				const settled = this.#settled(index, now);
				return {
					char: settled ? char : pick(pool),
					style: htmlSafe(
						`color: ${settled ? tint(char) : 'var(--canon-muted-foreground)'}`,
					),
				};
			}),
		};
	}

	get pool() {
		const { spec, text } = this.args;
		const used = new Set(text ?? '');
		return SETS.map(([key, set]) => ({
			off: !spec[key],
			cells: [...set].map((char) => {
				const struck =
					spec.excludeAmbiguous &&
					AMBIGUOUS_CHARS.includes(char);
				const on = !!spec[key] && !struck;
				return {
					char,
					on,
					struck: struck && !!spec[key],
					style:
						on && used.has(char)
							? htmlSafe(
									`background: ${tint(char)}`,
								)
							: undefined,
					used: on && used.has(char),
				};
			}),
		}));
	}

	get words() {
		void this.frame;
		const now = performance.now();
		const { phraseSpec, rolls } = this.args;
		let body = this.args.text ?? '';
		let digit: string | undefined;
		if (phraseSpec.trailingDigit && /\d$/.test(body)) {
			digit = body.slice(-1);
			body = body.slice(0, -1);
		}
		const parts = body.split(phraseSpec.separator);
		const mark = phraseSpec.separator.trim();
		return parts.map((word, index) => {
			const code = rolls?.get(word.toLowerCase());
			const faces = this.#settled(index, now)
				? [...(code ?? '')].map(Number)
				: [roll(), roll(), roll(), roll(), roll()];
			return {
				text: word,
				separator: index < parts.length - 1 ? mark : '',
				digit:
					index === parts.length - 1
						? digit
						: undefined,
				// ponytail: short words take three dice a row; measuring the word is the upgrade
				narrow: [...word].length < 4,
				dice: Array.from({ length: 5 }, (_, slot) => {
					const face = faces[slot];
					const pips = face
						? (PIPS[face - 1] ?? [])
						: [];
					return Array.from(
						{ length: 9 },
						(_, cell) =>
							pips.includes(cell),
					);
				}),
			};
		});
	}

	get figure() {
		const { bits } = this.args;
		return {
			text: bits.toFixed(1),
			colour: bandColour(bits),
			band: strengthBand(bits),
			style: htmlSafe(`color: ${bandColour(bits)}`),
		};
	}

	get scale() {
		const { bits } = this.args;
		return {
			fill: htmlSafe(
				`inline-size: ${(Math.min(bits, SCALE_END) / SCALE_END) * 100}%; background: ${bandColour(bits)}`,
			),
			marks: BANDS.map((band) =>
				htmlSafe(
					`inset-inline-start: ${(band / SCALE_END) * 100}%`,
				),
			),
		};
	}

	scramble = modifier((_element: Element, [key]: [number]) => {
		const first = this.#key === undefined;
		if (key === this.#key) return;
		this.#key = key;
		if (first || !this.args.text) return;
		if (
			window.matchMedia('(prefers-reduced-motion: reduce)')
				.matches
		)
			return;
		const start = performance.now();
		const count = this.args.phrase
			? this.args.text.split(this.args.phraseSpec.separator)
					.length
			: [...this.args.text].length;
		const step = this.args.phrase ? SETTLE.wordStep : SETTLE.step;
		this.#settle = Array.from(
			{ length: count },
			(_, i) => start + SETTLE.first + i * step,
		);
		const end = this.#settle.at(-1) ?? start;
		let raf = 0;
		let drawn = 0;
		const tick = (now: number) => {
			if (now - drawn >= FRAME_MS || now > end) {
				drawn = now;
				this.frame += 1;
			}
			if (now <= end) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			this.#settle = [];
		};
	});

	<template>
		<div class="pw-picture" {{this.scramble @scrambleKey}}>
			{{#if @phrase}}
				<div class="pw-words" aria-hidden="true">
					{{#each this.words as |word|}}
						<span class="pw-word">
							<span
								class="pw-word-text"
							>{{word.text}}
								{{~#if
									word.digit
								~}}
									<span
										class="pw-word-digit"
									>{{word.digit}}</span>
								{{~/if~}}
								{{~#if
									word.separator
								~}}
									<span
										class="pw-word-separator"
									>{{word.separator}}</span>
								{{~/if~}}
							</span>
							<span
								class="pw-dice
									{{if
										word.narrow
										'pw-dice--narrow'
									}}"
							>
								{{#each
									word.dice
									as |die|
								}}
									<span
										class="pw-die"
									>
										{{#each
											die
											as |pip|
										}}
											<span
												class={{if
													pip
													"pw-pip"
												}}
											></span>
										{{/each}}
									</span>
								{{/each}}
							</span>
						</span>
					{{/each}}
				</div>
			{{else}}
				<div
					class="pw-chars"
					style={{this.chars.style}}
					aria-hidden="true"
				>
					{{#each this.chars.list as |char|}}
						<span
							class="pw-char"
							style={{char.style}}
						>{{char.char}}</span>
					{{/each}}
				</div>
				<div class="pw-pool" aria-hidden="true">
					{{#each this.pool as |row|}}
						<div class="pw-pool-row">
							{{#each
								row.cells
								as |cell|
							}}
								<span
									class="pw-cell
										{{if
											cell.on
											'pw-cell--on'
										}}
										{{if
											cell.used
											'pw-cell--used'
										}}
										{{if
											cell.struck
											'pw-cell--struck'
										}}"
									style={{cell.style}}
								>{{cell.char}}</span>
							{{/each}}
						</div>
					{{/each}}
				</div>
			{{/if}}
			<output class="pw-strength" aria-live="polite">
				<CanonFigure
					@text={{this.figure.text}}
					@unit="bits"
					@size={{26}}
					@colour={{this.figure.colour}}
					@halo="var(--canon-card)"
				/>
				<span
					class="pw-band"
					style={{this.figure.style}}
				>{{this.figure.band}}</span>
			</output>
			<div class="pw-scale" aria-hidden="true">
				<span
					class="pw-scale-fill"
					style={{this.scale.fill}}
				></span>
				{{#each this.scale.marks as |mark|}}
					<span
						class="pw-scale-mark"
						style={{mark}}
					></span>
				{{/each}}
			</div>
		</div>
	</template>
}
