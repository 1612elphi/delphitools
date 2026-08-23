import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import type Owner from '@ember/owner';
import onClickOutside from 'ember-click-outside/modifiers/on-click-outside';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadUrl } from 'delphitools-v2/lib/download';
import {
	tokenise,
	reResolveTokens,
	setCoreDictionary,
	setFullDictionary,
	markerPrefix,
	nextMarker,
	type GlossToken,
	type GlossWord,
} from 'delphitools-v2/lib/shavian/transliterate';
import {
	loadCoreDictionary,
	loadFullDictionary,
} from 'delphitools-v2/lib/shavian/dictionary';
import {
	getAlternatives,
	type Alternative,
} from 'delphitools-v2/lib/shavian/alternatives';
import { getShavianLetter } from 'delphitools-v2/lib/shavian/phoneme-map';

// wording carried over from the Next app
const DEFAULT_TEXT = 'Mankind, be vigilant; we loved you.';

const COPIED_MS = 2000;

export type DictStatus =
	'loading-core' | 'loading-full' | 'core-only' | 'ready';

const CORE_ONLY_STATUS = 'Core dictionary only, uncommon words are guessed';

// lib/omni.ts imports parseDictJson from here.
export { parseDictJson } from 'delphitools-v2/lib/shavian/dictionary';

/** Tooltip on the Latin row, naming the marker the next click applies. */
export function markerTitle(marker: GlossWord['marker']): string {
	// wording carried over from the Next app
	switch (marker) {
		case 'none':
			return 'Add namer dot · (proper noun)';
		case 'namer':
			return 'Switch to acroring ⸰ (initialism)';
		case 'acroring':
			return 'Switch to acroarc ꤮ (acronym)';
		default:
			return 'Remove marker';
	}
}

/** The Shavian text alone, punctuation and spacing included. */
export function glossToText(tokens: GlossToken[]): string {
	return tokens
		.map((token) =>
			token.type === 'word' && token.gloss
				? token.gloss.shavian
				: token.value,
		)
		.join('');
}

/** The gloss with `marker` applied and the Shavian line rebuilt around it. */
export function withMarker(
	token: GlossToken,
	marker: GlossWord['marker'],
): GlossToken {
	if (token.type !== 'word' || !token.gloss) return token;
	return {
		...token,
		gloss: {
			...token.gloss,
			marker,
			shavian:
				markerPrefix(marker) +
				token.gloss.phonemes
					.map((p) => p.shavian)
					.join(''),
		},
	};
}

/** The gloss with one phoneme replaced, marked as hand-edited. */
export function withPhoneme(
	token: GlossToken,
	phonemeIndex: number,
	alternative: Alternative,
): GlossToken {
	if (token.type !== 'word' || !token.gloss) return token;
	const phonemes = [...token.gloss.phonemes];
	phonemes[phonemeIndex] = {
		shavian: alternative.shavian,
		ipa: alternative.ipa,
		alternatives: getAlternatives(alternative.shavian),
	};
	return {
		...token,
		gloss: {
			...token.gloss,
			phonemes,
			shavian:
				markerPrefix(token.gloss.marker) +
				phonemes.map((p) => p.shavian).join(''),
			ipa: phonemes.map((p) => p.ipa).join(''),
			userEdited: true,
		},
	};
}

const CANVAS_WIDTH = 1200;
const PADDING = 40;
const WORD_GAP = 24;
const LINE_HEIGHT = 80;
const BRANDING_HEIGHT = 40;
const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2;

const LATIN_FONT = '14px system-ui';
const SHAVIAN_FONT = "22px 'Noto Sans Shavian', sans-serif";
const IPA_FONT = '13px system-ui';
const PUNCTUATION_FONT = '18px system-ui';
const BRAND_FONT = '12px system-ui';
const MARKED_COLOUR = '#ff9f43';

/** The three-row gloss drawn to a PNG and downloaded. */
export async function exportGloss(tokens: GlossToken[]) {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	// Measuring in the Shavian face before it loads gives fallback widths.
	await document.fonts.ready;

	const isDark =
		document.documentElement.classList.contains('dark') ||
		window.matchMedia('(prefers-color-scheme: dark)').matches;
	const bgColour = isDark ? '#0a0a0a' : '#ffffff';
	const latinColour = isDark ? '#8888aa' : '#666688';
	const shavianColour = isDark ? '#e8e8ff' : '#1a1a2e';
	const ipaColour = isDark ? '#66cc88' : '#227744';
	const brandColour = isDark ? '#555' : '#aaa';

	const measurements: { token: GlossToken; width: number }[] = [];
	ctx.font = LATIN_FONT;
	for (const token of tokens) {
		if (token.type === 'word' && token.gloss) {
			ctx.font = LATIN_FONT;
			const latinWidth = ctx.measureText(
				token.gloss.latin,
			).width;
			ctx.font = SHAVIAN_FONT;
			const shavianWidth = ctx.measureText(
				token.gloss.phonemes
					.map((p) => p.shavian)
					.join(''),
			).width;
			ctx.font = IPA_FONT;
			const ipaWidth = ctx.measureText(token.gloss.ipa).width;
			measurements.push({
				token,
				width: Math.max(
					latinWidth,
					shavianWidth,
					ipaWidth,
				),
			});
		} else if (token.type === 'punctuation') {
			ctx.font = LATIN_FONT;
			measurements.push({
				token,
				width: ctx.measureText(token.value).width,
			});
		}
	}

	const lines: (typeof measurements)[] = [];
	let currentLine: typeof measurements = [];
	let currentWidth = 0;
	for (const measurement of measurements) {
		if (
			currentWidth + measurement.width + WORD_GAP >
				CONTENT_WIDTH &&
			currentLine.length > 0
		) {
			lines.push(currentLine);
			currentLine = [measurement];
			currentWidth = measurement.width;
		} else {
			currentLine.push(measurement);
			currentWidth += measurement.width + WORD_GAP;
		}
	}
	if (currentLine.length > 0) lines.push(currentLine);

	canvas.width = CANVAS_WIDTH;
	canvas.height =
		PADDING +
		lines.length * LINE_HEIGHT +
		BRANDING_HEIGHT +
		PADDING;

	ctx.fillStyle = bgColour;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	let y = PADDING;
	for (const line of lines) {
		let x = PADDING;
		for (const { token } of line) {
			if (token.type === 'punctuation') {
				ctx.font = PUNCTUATION_FONT;
				ctx.fillStyle = latinColour;
				ctx.textAlign = 'left';
				ctx.fillText(token.value, x, y + 42);
				x += ctx.measureText(token.value).width + 4;
				continue;
			}

			const gloss = token.gloss;
			if (!gloss) continue;
			const prefix = markerPrefix(gloss.marker);
			const shavianText =
				prefix +
				gloss.phonemes.map((p) => p.shavian).join('');

			ctx.font = LATIN_FONT;
			ctx.fillStyle = latinColour;
			ctx.textAlign = 'left';
			ctx.fillText(gloss.latin, x, y + 14);
			const latinWidth = ctx.measureText(gloss.latin).width;

			ctx.font = SHAVIAN_FONT;
			ctx.fillStyle =
				gloss.marker !== 'none'
					? MARKED_COLOUR
					: shavianColour;
			ctx.fillText(shavianText, x, y + 42);
			const shavianWidth = ctx.measureText(shavianText).width;

			ctx.font = IPA_FONT;
			ctx.fillStyle = ipaColour;
			ctx.fillText(gloss.ipa, x, y + 62);

			x += Math.max(latinWidth, shavianWidth) + WORD_GAP;
		}
		y += LINE_HEIGHT;
	}

	ctx.font = BRAND_FONT;
	ctx.fillStyle = brandColour;
	ctx.textAlign = 'right';
	ctx.fillText(
		'delphi.tools',
		CANVAS_WIDTH - PADDING,
		canvas.height - PADDING + 8,
	);

	downloadUrl(canvas.toDataURL('image/png'), 'shavian-gloss.png');
}

export default class ShavianTransliteratorTool extends Component {
	@tracked input = DEFAULT_TEXT;
	@tracked tokens: GlossToken[] = [];
	@tracked dictStatus: DictStatus = 'loading-core';
	@tracked copied = false;
	@tracked activeToken: number | null = null;
	@tracked activePhoneme: number | null = null;

	#copiedTimer?: ReturnType<typeof setTimeout>;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		void this.#loadDictionaries();
	}

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
	}

	/**
	 * Core first so the gloss appears at once, then the full dictionary in the
	 * background; words the heuristic guessed are re-resolved when it lands.
	 */
	async #loadDictionaries() {
		const core = await loadCoreDictionary();
		if (this.isDestroyed) return;
		setCoreDictionary(core);
		this.dictStatus = 'loading-full';
		if (this.input) this.tokens = tokenise(this.input);

		try {
			const full = await loadFullDictionary();
			if (this.isDestroyed) return;
			setFullDictionary(full);
			this.tokens = reResolveTokens(this.tokens);
		} catch (error) {
			// The heuristic stands and the tool still works, but its output is
			// a guess for every word outside the core, which reads as a
			// working tool with wrong pronunciations unless it says so.
			console.error(
				'shavian full dictionary failed to load:',
				error,
			);
			if (this.isDestroyed) return;
			this.dictStatus = 'core-only';
			return;
		}
		if (this.isDestroyed) return;
		this.dictStatus = 'ready';
	}

	get coreOnlyStatus() {
		return CORE_ONLY_STATUS;
	}

	get hasContent() {
		return this.tokens.some((token) => token.type === 'word');
	}

	get glossTokens() {
		return this.tokens.map((token, index) => {
			const gloss = token.gloss;
			if (token.type !== 'word' || !gloss) {
				return {
					key: `${token.type}-${index}-${token.value}`,
					kind: token.type,
					value: token.value,
					index,
					latin: '',
					marked: false,
					prefix: '',
					title: '',
					heuristic: false,
					phonemes: [],
				};
			}
			return {
				key: `word-${index}-${gloss.latin}`,
				kind: 'word',
				value: token.value,
				index,
				latin: gloss.latin,
				marked: gloss.marker !== 'none',
				prefix: markerPrefix(gloss.marker),
				title: markerTitle(gloss.marker),
				heuristic:
					gloss.source === 'heuristic' &&
					!gloss.userEdited,
				phonemes: gloss.phonemes.map(
					(phoneme, phonemeIndex) => ({
						key: `${index}-${phonemeIndex}`,
						tokenIndex: index,
						phonemeIndex,
						shavian: phoneme.shavian,
						ipa: phoneme.ipa,
						name:
							getShavianLetter(
								phoneme.shavian,
							)?.name ?? '',
						isActive:
							this.activeToken ===
								index &&
							this.activePhoneme ===
								phonemeIndex,
						alternatives:
							phoneme.alternatives,
					}),
				),
			};
		});
	}

	setInput = (event: Event) => {
		this.input = (event.target as HTMLTextAreaElement).value;
		this.tokens = tokenise(this.input);
		this.closePopover();
	};

	closePopover = () => {
		this.activeToken = null;
		this.activePhoneme = null;
	};

	togglePopover = (tokenIndex: number, phonemeIndex: number) => {
		const isActive =
			this.activeToken === tokenIndex &&
			this.activePhoneme === phonemeIndex;
		this.activeToken = isActive ? null : tokenIndex;
		this.activePhoneme = isActive ? null : phonemeIndex;
	};

	cycleMarker = (tokenIndex: number) => {
		this.tokens = this.tokens.map((token, index) => {
			if (index !== tokenIndex || !token.gloss) return token;
			return withMarker(
				token,
				nextMarker(token.gloss.marker),
			);
		});
	};

	swapPhoneme = (
		tokenIndex: number,
		phonemeIndex: number,
		alternative: Alternative,
	) => {
		this.tokens = this.tokens.map((token, index) =>
			index === tokenIndex
				? withPhoneme(token, phonemeIndex, alternative)
				: token,
		);
		this.closePopover();
	};

	copyShavian = () => {
		void navigator.clipboard.writeText(glossToText(this.tokens));
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	};

	downloadGloss = () => void exportGloss(this.tokens);

	<template>
		<div class="dt-shav">
			{{! wording carried over from the Next app }}
			<div class="dt-shav-intro">
				<p>The
					<strong>Shavian alphabet</strong>
					(𐑖𐑱𐑝𐑾𐑯) is a phonemic writing system
					designed for English by Kingsley Read,
					commissioned by the will of George
					Bernard Shaw. Each letter represents
					exactly one sound — no silent letters,
					no ambiguous spellings.</p>
				<p>Type or paste English text below. Click
					individual Shavian letters to swap
					phonemes. Click a Latin word to cycle
					through markers: namer dot · (proper
					noun), acroring ⸰ (initialism), acroarc
					꤮ (pronounceable acronym).</p>
			</div>

			<div class="dt-shav-frame">
				<div class="dt-shav-input-pane">
					<div class="dt-shav-pane-head">
						{{! wording carried over from the Next app }}
						<span
							class="dt-shav-label"
						>English input</span>
					</div>
					{{! wording carried over from the Next app }}
					<textarea
						class="dt-shav-input"
						aria-label="English input"
						placeholder="Type or paste English text here..."
						value={{this.input}}
						{{on "input" this.setInput}}
					></textarea>
				</div>

				<div>
					<div class="dt-shav-pane-head is-split">
						{{! wording carried over from the Next app }}
						<span
							class="dt-shav-label"
						>Shavian gloss</span>
						{{#if
							(eq
								this.dictStatus
								"loading-core"
							)
						}}
							<span
								class="dt-shav-status"
							>
								<NdsLoader />
								{{! wording carried over from the Next app }}
								Loading
								dictionary…
							</span>
						{{else if
							(eq
								this.dictStatus
								"loading-full"
							)
						}}
							<span
								class="dt-shav-status"
							>
								<NdsLoader />
								{{! wording carried over from the Next app }}
								Loading full
								dictionary…
							</span>
						{{else if
							(eq
								this.dictStatus
								"core-only"
							)
						}}
							<span
								class="dt-shav-status is-degraded"
							>
								<Icon
									@name="triangle-alert"
								/>
								{{this.coreOnlyStatus}}
							</span>
						{{else}}
							{{! wording carried over from the Next app }}
							<span
								class="dt-shav-status is-ready"
							>Dictionary ready</span>
						{{/if}}
					</div>

					<div
						class="dt-shav-grid-wrap"
						{{onClickOutside
							this.closePopover
						}}
					>
						{{#if this.hasContent}}
							<div
								class="dt-shav-grid"
							>
								{{#each
									this.glossTokens
									key="key"
									as |token|
								}}
									{{#if
										(eq
											token.kind
											"whitespace"
										)
									}}
										<span
											class="dt-shav-space"
										></span>
									{{else if
										(eq
											token.kind
											"punctuation"
										)
									}}
										<span
											class="dt-shav-punct"
										>{{token.value}}</span>
									{{else}}
										<div
											class="dt-shav-word"
										>
											<button
												type="button"
												class="dt-shav-latin
													{{if
														token.marked
														'is-marked'
													}}"
												title={{token.title}}
												{{on
													"click"
													(fn
														this.cycleMarker
														token.index
													)
												}}
											>{{token.latin}}</button>

											<div
												class="dt-shav-letters"
											>
												{{#if
													token.marked
												}}
													<span
														class="dt-shav-marker"
													>{{token.prefix}}</span>
												{{/if}}
												{{#each
													token.phonemes
													key="key"
													as |phoneme|
												}}
													<div
														class="dt-shav-phoneme"
													>
														<button
															type="button"
															class="dt-shav-glyph
																{{if
																	phoneme.isActive
																	'is-active'
																}}
																{{if
																	token.marked
																	'is-marked'
																}}"
															aria-label={{phoneme.name}}
															{{on
																"click"
																(fn
																	this.togglePopover
																	phoneme.tokenIndex
																	phoneme.phonemeIndex
																)
															}}
														>{{phoneme.shavian}}</button>

														{{#if
															phoneme.isActive
														}}
															<div
																class="dt-shav-popover"
															>
																<div
																	class="dt-shav-current"
																>
																	<span
																		class="dt-shav-option-glyph"
																	>{{phoneme.shavian}}</span>
																	<span
																		class="dt-shav-option-name"
																	>{{phoneme.name}}</span>
																	<span
																		class="dt-shav-option-ipa"
																	>/{{phoneme.ipa}}/</span>
																</div>
																{{#each
																	phoneme.alternatives
																	key="shavian"
																	as |alt|
																}}
																	<button
																		type="button"
																		class="dt-shav-option"
																		{{on
																			"click"
																			(fn
																				this.swapPhoneme
																				phoneme.tokenIndex
																				phoneme.phonemeIndex
																				alt
																			)
																		}}
																	>
																		<span
																			class="dt-shav-option-glyph"
																		>{{alt.shavian}}</span>
																		<span
																			class="dt-shav-option-name"
																		>{{alt.name}}</span>
																		<span
																			class="dt-shav-option-ipa"
																		>/{{alt.ipa}}/</span>
																	</button>
																{{/each}}
															</div>
														{{/if}}
													</div>
												{{/each}}
											</div>

											<div
												class="dt-shav-ipa-row
													{{if
														token.heuristic
														'is-heuristic'
													}}"
											>
												{{#each
													token.phonemes
													key="key"
													as |phoneme|
												}}
													<span
														class="dt-shav-ipa"
													>{{phoneme.ipa}}</span>
												{{/each}}
											</div>
										</div>
									{{/if}}
								{{/each}}
							</div>
						{{else}}
							{{! wording carried over from the Next app }}
							<p
								class="dt-shav-empty"
							>Start typing above to
								see the Shavian
								transliteration.</p>
						{{/if}}
					</div>

					<div class="dt-shav-legend">
						<span
							class="dt-shav-legend-item"
						>
							<span
								class="dt-shav-dot is-dict"
							></span>
							{{! wording carried over from the Next app }}
							Dictionary match
						</span>
						<span
							class="dt-shav-legend-item"
						>
							<span
								class="dt-shav-dot is-heuristic"
							></span>
							{{! wording carried over from the Next app }}
							Heuristic guess
						</span>
						<span
							class="dt-shav-legend-item"
						>
							<span
								class="dt-shav-dot is-marked"
							></span>
							{{! wording carried over from the Next app }}
							Marked (· namer, ⸰
							initialism, ꤮ acronym)
						</span>
					</div>
				</div>

				{{#if this.hasContent}}
					<div class="dt-shav-actions">
						<button
							type="button"
							class="dt-shav-copy"
							{{on
								"click"
								this.copyShavian
							}}
						>
							<Icon
								@name={{if
									this.copied
									"check"
									"copy"
								}}
							/>
							{{#if this.copied}}
								{{! wording carried over from the Next app }}
								Copied!
							{{else}}
								{{! wording carried over from the Next app }}
								Copy Shavian
							{{/if}}
						</button>
						<button
							type="button"
							class="dt-shav-export"
							{{on
								"click"
								this.downloadGloss
							}}
						>
							<DownloadLabel
								@label="Export Gloss"
							/>
						</button>
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
