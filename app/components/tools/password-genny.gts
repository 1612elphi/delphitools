import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type Owner from '@ember/owner';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import Switch from 'delphitools-v2/components/ui/switch';
import {
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	PASSPHRASE_MAX_WORDS,
	PASSPHRASE_MIN_WORDS,
	buildCharset,
	buildPassphrase,
	charKind,
	generatePassword,
	parseWordlist,
	passphraseEntropy,
	passwordEntropy,
	strengthBand,
} from 'delphitools-v2/lib/password';

const WORDLIST_URL = '/data/eff-large-wordlist.txt';
/* EFF large list, fixed at 7,776 entries: the entropy readout is correct
   before the fetch lands. parseWordlist's result is checked against it. */
const EFF_LIST_SIZE = 7776;
const COPIED_MS = 2000;

type Mode = 'password' | 'passphrase';
type ClassKey = 'lowercase' | 'uppercase' | 'digits' | 'symbols';
type WordStatus = 'idle' | 'loading' | 'ready' | 'error';

const MODES: { id: Mode; label: string }[] = [
	{ id: 'password', label: 'Password' },
	{ id: 'passphrase', label: 'Passphrase' },
];

const BULK_COUNTS = [5, 10, 20];

const SEPARATORS: { id: string; value: string; label: string; text: string }[] =
	[
		{ id: 'hyphen', value: '-', label: 'Hyphen', text: '-' },
		{ id: 'space', value: ' ', label: 'Space', text: 'Space' },
		{ id: 'period', value: '.', label: 'Period', text: '.' },
		{
			id: 'underscore',
			value: '_',
			label: 'Underscore',
			text: '_',
		},
	];

// The wordlist is a static asset, fetched once per session and lazy so it
// stays out of the bundle. A cached rejection would deny every later mount a
// retry, so the catch resets the slot (the shavian dictionary's pattern).
let wordlistPromise: Promise<string[]> | null = null;

function loadWordlist(): Promise<string[]> {
	wordlistPromise ??= fetch(WORDLIST_URL)
		.then((response) => {
			// fetch resolves on 404; without this the miss reaches text() and a
			// wordlist of HTML error-page words would pass for real data.
			if (!response.ok)
				throw new Error(`HTTP ${response.status}`);
			return response.text();
		})
		.then(parseWordlist)
		.then((words) => {
			if (words.length < EFF_LIST_SIZE / 2) {
				throw new Error(
					`only ${words.length} words parsed`,
				);
			}
			return words;
		})
		.catch((error: unknown) => {
			wordlistPromise = null;
			throw error;
		});
	return wordlistPromise;
}

const WORDLIST_ERROR =
	'The word list failed to load, password mode still works.';

export default class PasswordGeneratorTool extends Component {
	@tracked mode: Mode = 'password';
	@tracked length = 16;
	@tracked lowercase = true;
	@tracked uppercase = true;
	@tracked digits = true;
	@tracked symbols = true;
	@tracked excludeAmbiguous = true;
	@tracked wordCount = 5;
	@tracked separator = '-';
	@tracked capitaliseFirst = true;
	@tracked trailingDigit = true;
	@tracked bulkCount = 10;
	@tracked list: string[] = [];
	@tracked copiedKey: string | number | null = null;
	@tracked wordStatus: WordStatus = 'idle';

	#wordlist: string[] | null = null;
	#copiedTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		this.regenerate();
	}

	get pool(): string {
		return buildCharset(this);
	}

	get bits(): number {
		if (this.mode === 'password') {
			return passwordEntropy(this.length, this.pool.length);
		}
		return passphraseEntropy(
			this.wordCount,
			this.#wordlist?.length ?? EFF_LIST_SIZE,
			this.trailingDigit,
		);
	}

	get strength(): string {
		return `${this.bits.toFixed(1)} bits · ${strengthBand(this.bits)}`;
	}

	get generateDisabled(): boolean {
		return (
			this.mode === 'passphrase' &&
			this.wordStatus !== 'ready'
		);
	}

	get wordError(): string {
		return WORDLIST_ERROR;
	}

	get modes() {
		return MODES;
	}

	get bulkCounts() {
		return BULK_COUNTS;
	}

	get separators() {
		return SEPARATORS;
	}

	get passwordMode(): boolean {
		return this.mode === 'password';
	}

	setMode = (mode: Mode) => {
		if (mode === this.mode) return;
		this.mode = mode;
		if (mode === 'passphrase') {
			if (this.wordStatus !== 'ready') this.list = [];
			void this.#ensureWordlist();
			return;
		}
		this.regenerate();
	};

	setLength = (event: Event) => {
		this.length = Number((event.target as HTMLInputElement).value);
		this.regenerate();
	};

	setWordCount = (event: Event) => {
		this.wordCount = Number(
			(event.target as HTMLInputElement).value,
		);
		this.regenerate();
	};

	setSeparator = (value: string) => {
		this.separator = value;
		this.regenerate();
	};

	setBulkCount = (count: number) => {
		this.bulkCount = count;
		this.regenerate();
	};

	#setClass(key: ClassKey, on: boolean) {
		const state: Record<ClassKey, boolean> = {
			lowercase: this.lowercase,
			uppercase: this.uppercase,
			digits: this.digits,
			symbols: this.symbols,
		};
		// At least one class always stays on; an empty pool cannot generate.
		if (
			!on &&
			!Object.keys(state).some(
				(k) => state[k as ClassKey] && k !== key,
			)
		)
			return;
		this[key] = on;
		this.regenerate();
	}

	setLowercase = (on: boolean) => this.#setClass('lowercase', on);
	setUppercase = (on: boolean) => this.#setClass('uppercase', on);
	setDigits = (on: boolean) => this.#setClass('digits', on);
	setSymbols = (on: boolean) => this.#setClass('symbols', on);

	setExcludeAmbiguous = (on: boolean) => {
		this.excludeAmbiguous = on;
		this.regenerate();
	};

	setCapitaliseFirst = (on: boolean) => {
		this.capitaliseFirst = on;
		this.regenerate();
	};

	setTrailingDigit = (on: boolean) => {
		this.trailingDigit = on;
		this.regenerate();
	};

	regenerate = () => {
		if (this.mode === 'passphrase') {
			if (this.wordStatus !== 'ready' || !this.#wordlist)
				return;
			const words = this.#wordlist;
			const spec = {
				words: this.wordCount,
				separator: this.separator,
				capitaliseFirst: this.capitaliseFirst,
				trailingDigit: this.trailingDigit,
			};
			this.list = Array.from({ length: this.bulkCount }, () =>
				buildPassphrase(words, spec),
			);
			return;
		}
		this.list = Array.from({ length: this.bulkCount }, () =>
			generatePassword(this),
		);
	};

	retryWordlist = () => {
		void this.#ensureWordlist();
	};

	async #ensureWordlist() {
		if (this.#wordlist) {
			if (this.mode === 'passphrase') this.regenerate();
			return;
		}
		if (this.wordStatus === 'loading') return;
		this.wordStatus = 'loading';
		try {
			this.#wordlist = await loadWordlist();
		} catch (error) {
			console.error(
				'password-genny: wordlist fetch failed',
				error,
			);
			if (this.isDestroyed) return;
			this.wordStatus = 'error';
			return;
		}
		if (this.isDestroyed) return;
		this.wordStatus = 'ready';
		if (this.mode === 'passphrase') this.regenerate();
	}

	charSpans = (text: string) =>
		[...text].map((ch) => {
			const kind = charKind(ch);
			return {
				ch,
				cls:
					kind === 'letter'
						? 'dt-pg-ch'
						: `dt-pg-ch is-${kind}`,
			};
		});

	copy = async (value: string, key: string | number) => {
		await navigator.clipboard.writeText(value);
		this.copiedKey = key;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copiedKey = null),
			COPIED_MS,
		);
	};

	copyAll = () => {
		void this.copy(this.list.join('\n'), 'all');
	};

	<template>
		<div class="dt-pg">
			<div class="dt-pg-frame">
				<div class="dt-pg-bar">
					<div
						class="segmented dt-pg-modes"
						aria-label="Mode"
					>
						{{#each
							this.modes key="id"
							as |mode|
						}}
							<button
								type="button"
								class="dt-pg-mode
									{{if
										(eq
											this.mode
											mode.id
										)
										'is-active'
									}}"
								aria-pressed={{if
									(eq
										this.mode
										mode.id
									)
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										this.setMode
										mode.id
									)
								}}
							>{{mode.label}}</button>
						{{/each}}
					</div>
					<span
						class="dt-pg-strength"
						aria-live="polite"
					>{{this.strength}}</span>
					<div
						class="segmented dt-pg-count"
						aria-label="List size"
					>
						{{#each
							this.bulkCounts
							as |count|
						}}
							<button
								type="button"
								class="dt-pg-countbtn
									{{if
										(eq
											this.bulkCount
											count
										)
										'is-active'
									}}"
								aria-pressed={{if
									(eq
										this.bulkCount
										count
									)
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										this.setBulkCount
										count
									)
								}}
							>{{count}}</button>
						{{/each}}
					</div>
					<button
						type="button"
						class="dt-pg-generate is-primary"
						disabled={{this.generateDisabled}}
						{{on "click" this.regenerate}}
					>
						<Icon @name="refresh-cw" />
						Generate
					</button>
				</div>

				{{#if this.passwordMode}}
					<div class="dt-pg-settings">
						<label
							class="dt-pg-field is-length"
						>
							<span>Length</span>
							<span
								class="dt-pg-slider"
							>
								<input
									type="range"
									min={{PASSWORD_MIN_LENGTH}}
									max={{PASSWORD_MAX_LENGTH}}
									value={{this.length}}
									{{on
										"input"
										this.setLength
									}}
								/>
								<span
									class="dt-pg-readout"
								>{{this.length}}</span>
							</span>
						</label>
						<div class="dt-pg-field">
							<span>Lowercase</span>
							<Switch
								@checked={{this.lowercase}}
								@onChange={{this.setLowercase}}
								@label="Lowercase"
							/>
						</div>
						<div class="dt-pg-field">
							<span>Uppercase</span>
							<Switch
								@checked={{this.uppercase}}
								@onChange={{this.setUppercase}}
								@label="Uppercase"
							/>
						</div>
						<div class="dt-pg-field">
							<span>Digits</span>
							<Switch
								@checked={{this.digits}}
								@onChange={{this.setDigits}}
								@label="Digits"
							/>
						</div>
						<div class="dt-pg-field">
							<span>Symbols</span>
							<Switch
								@checked={{this.symbols}}
								@onChange={{this.setSymbols}}
								@label="Symbols"
							/>
						</div>
						<div class="dt-pg-field">
							<span>No lookalikes</span>
							<Switch
								@checked={{this.excludeAmbiguous}}
								@onChange={{this.setExcludeAmbiguous}}
								@label="No lookalikes"
							/>
						</div>
					</div>
				{{else}}
					<div class="dt-pg-settings">
						<label
							class="dt-pg-field is-length"
						>
							<span>Words</span>
							<span
								class="dt-pg-slider"
							>
								<input
									type="range"
									min={{PASSPHRASE_MIN_WORDS}}
									max={{PASSPHRASE_MAX_WORDS}}
									value={{this.wordCount}}
									{{on
										"input"
										this.setWordCount
									}}
								/>
								<span
									class="dt-pg-readout"
								>{{this.wordCount}}</span>
							</span>
						</label>
						<div
							class="dt-pg-field is-separator"
						>
							<span>Separator</span>
							<span
								class="segmented dt-pg-seps"
							>
								{{#each
									this.separators
									key="id"
									as |sep|
								}}
									<button
										type="button"
										class="dt-pg-sep
											{{if
												(eq
													this.separator
													sep.value
												)
												'is-active'
											}}"
										aria-label={{sep.label}}
										aria-pressed={{if
											(eq
												this.separator
												sep.value
											)
											"true"
											"false"
										}}
										{{on
											"click"
											(fn
												this.setSeparator
												sep.value
											)
										}}
									>{{sep.text}}</button>
								{{/each}}
							</span>
						</div>
						<div class="dt-pg-field">
							<span>Capitalise</span>
							<Switch
								@checked={{this.capitaliseFirst}}
								@onChange={{this.setCapitaliseFirst}}
								@label="Capitalise"
							/>
						</div>
						<div class="dt-pg-field">
							<span>Trailing digit</span>
							<Switch
								@checked={{this.trailingDigit}}
								@onChange={{this.setTrailingDigit}}
								@label="Trailing digit"
							/>
						</div>
						{{#if
							(eq
								this.wordStatus
								"loading"
							)
						}}
							<div
								class="dt-pg-wordloading"
							>
								<Icon
									@name="loader-circle"
								/>
								Loading…
							</div>
						{{/if}}
						{{#if
							(eq
								this.wordStatus
								"error"
							)
						}}
							<div
								class="dt-pg-worderror"
								role="alert"
							>
								<span
								>{{this.wordError}}</span>
								<button
									type="button"
									class="dt-pg-retry"
									{{on
										"click"
										this.retryWordlist
									}}
								>
									<Icon
										@name="refresh-cw"
									/>
									Retry
								</button>
							</div>
						{{/if}}
					</div>
				{{/if}}

				{{#if this.list.length}}
					<div class="dt-pg-listhead">
						<span>List ·
							{{this.list.length}}</span>
						<button
							type="button"
							class="dt-pg-copyall"
							{{on
								"click"
								this.copyAll
							}}
						>
							<Icon
								@name={{if
									(eq
										this.copiedKey
										"all"
									)
									"check"
									"copy"
								}}
							/>
							Copy all
						</button>
					</div>
					<ul class="dt-pg-list">
						{{#each
							this.list key="@index"
							as |item index|
						}}
							<li class="dt-pg-item">
								<span
									class="dt-pg-value"
									aria-label={{item}}
								>{{#each
										(this.charSpans
											item
										)
										as |c|
									}}<span
											class={{c.cls}}
											aria-hidden="true"
										>{{c.ch}}</span>{{/each}}</span>
								<button
									type="button"
									class="dt-pg-itemcopy"
									aria-label="Copy"
									{{on
										"click"
										(fn
											this.copy
											item
											index
										)
									}}
								>
									<Icon
										@name={{if
											(eq
												this.copiedKey
												index
											)
											"check"
											"copy"
										}}
									/>
								</button>
							</li>
						{{/each}}
					</ul>
				{{/if}}
			</div>
		</div>
	</template>
}
