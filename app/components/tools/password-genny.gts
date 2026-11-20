import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonSwitch from 'delphicanon/components/canon-switch';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadText } from 'delphitools-v2/lib/download';
import {
	AMBIGUOUS_CHARS,
	PASSPHRASE_MAX_WORDS,
	PASSPHRASE_MIN_WORDS,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	buildCharset,
	buildPassphrase,
	generatePassword,
	parseRolls,
	parseWordlist,
	passphraseEntropy,
	passwordEntropy,
} from 'delphitools-v2/lib/password';
import Picture, {
	phraseTint,
	tint,
} from 'delphitools-v2/components/tools/password-genny/picture';
import './password-genny/password-genny.css';

const WORDLIST_URL = '/data/eff-large-wordlist.txt';
const EFF_LIST_SIZE = 7776;
const WORDLIST_ERROR =
	'The word list failed to load, password mode still works.';

type ClassKey = 'lowercase' | 'uppercase' | 'digits' | 'symbols';
type WordStatus = 'idle' | 'loading' | 'ready' | 'error';

const MODES = ['Password', 'Passphrase'];
const BULK_COUNTS = [5, 10, 20];
const COUNT_TITLES = BULK_COUNTS.map(String);
const SEPARATORS = [
	{ value: '-', label: 'Hyphen' },
	{ value: ' ', label: 'Space' },
	{ value: '.', label: 'Period' },
	{ value: '_', label: 'Underscore' },
];
const SEPARATOR_TITLES = SEPARATORS.map((s) =>
	s.value === ' ' ? s.label : s.value,
);
const CLASSES: { key: ClassKey; title: string }[] = [
	{ key: 'lowercase', title: 'Lowercase' },
	{ key: 'uppercase', title: 'Uppercase' },
	{ key: 'digits', title: 'Digits' },
	{ key: 'symbols', title: 'Symbols' },
];
const FADE_ROWS = 24;
const FADE_STEP = 0.018;

interface Wordlist {
	words: string[];
	rolls: Map<string, string>;
}

let wordlistPromise: Promise<Wordlist> | null = null;

function loadWordlist(): Promise<Wordlist> {
	wordlistPromise ??= fetch(WORDLIST_URL)
		.then((response) => {
			if (!response.ok)
				throw new Error(`HTTP ${response.status}`);
			return response.text();
		})
		.then((text) => {
			const words = parseWordlist(text);
			if (words.length < EFF_LIST_SIZE / 2)
				throw new Error(
					`only ${words.length} words parsed`,
				);
			return { words, rolls: parseRolls(text) };
		})
		.catch((error: unknown) => {
			wordlistPromise = null;
			throw error;
		});
	return wordlistPromise;
}

const Refresh = <template><IconSvg @name="refresh-cw" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Download = <template><IconSvg @name="download" /></template>;

export default class PasswordGennyTool extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked phrase = false;
	@tracked length = 16;
	@tracked lowercase = true;
	@tracked uppercase = true;
	@tracked digits = true;
	@tracked symbols = true;
	@tracked excludeAmbiguous = true;
	@tracked words = 5;
	@tracked separator = 0;
	@tracked capitaliseFirst = true;
	@tracked trailingDigit = true;
	@tracked count = 10;
	@tracked list: string[] = [];
	@tracked selected = 0;
	@tracked fades = false;
	@tracked scrambleKey = 0;
	@tracked wordStatus: WordStatus = 'idle';
	@tracked wordlist?: Wordlist;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const length = Number(query.get('pwLength'));
		if (length)
			this.length = this.#clamp(
				length,
				PASSWORD_MIN_LENGTH,
				PASSWORD_MAX_LENGTH,
			);
		if (query.get('pwSymbols') === '0') this.symbols = false;
		this.selected = Number(query.get('pwSelect')) || 0;
		if (query.get('pwPhrase')) {
			this.phrase = true;
			queueMicrotask(() => void this.#ensureWordlist());
		} else this.#fill();
	}

	#clamp(value: number, min: number, max: number) {
		return Math.min(max, Math.max(min, Math.round(value)));
	}

	get spec() {
		return {
			length: this.length,
			lowercase: this.lowercase,
			uppercase: this.uppercase,
			digits: this.digits,
			symbols: this.symbols,
			excludeAmbiguous: this.excludeAmbiguous,
		};
	}

	get phraseSpec() {
		return {
			words: this.words,
			separator: SEPARATORS[this.separator]?.value ?? '-',
			capitaliseFirst: this.capitaliseFirst,
			trailingDigit: this.trailingDigit,
		};
	}

	get bits() {
		return this.phrase
			? passphraseEntropy(
					this.words,
					this.wordlist?.words.length ??
						EFF_LIST_SIZE,
					this.trailingDigit,
				)
			: passwordEntropy(
					this.length,
					buildCharset(this.spec).length,
				);
	}

	get modeIndex() {
		return this.phrase ? 1 : 0;
	}

	get countIndex() {
		return BULK_COUNTS.indexOf(this.count);
	}

	get classes() {
		const last = CLASSES.filter((c) => this[c.key]).length === 1;
		return CLASSES.map((c) => ({
			...c,
			on: this[c.key],
			locked: last && this[c.key],
		}));
	}

	get loading() {
		return this.phrase && this.wordStatus === 'loading';
	}

	get failed() {
		return this.phrase && this.wordStatus === 'error';
	}

	get blocked() {
		return this.phrase && this.wordStatus !== 'ready';
	}

	get empty() {
		return this.list.length === 0;
	}

	get shownIndex() {
		return Math.min(
			Math.max(this.selected, 0),
			this.list.length - 1,
		);
	}

	get shown() {
		return this.list[this.shownIndex];
	}

	get rows() {
		const colour = this.phrase ? phraseTint : tint;
		return this.list.map((value, index) => ({
			value,
			number: String(index + 1).padStart(2, '0'),
			lit: index === this.shownIndex,
			fadeDelay:
				this.fades && index < FADE_ROWS
					? index * FADE_STEP
					: undefined,
			tint: colour,
		}));
	}

	regenerate = () => {
		this.fades = true;
		this.scrambleKey += 1;
		this.#fill();
	};

	#fill() {
		if (this.phrase) {
			const list = this.wordlist?.words;
			this.list = list
				? Array.from({ length: this.count }, () =>
						buildPassphrase(
							list,
							this.phraseSpec,
						),
					)
				: [];
			return;
		}
		this.list = Array.from({ length: this.count }, () =>
			generatePassword(this.spec),
		);
	}

	setMode = (index: number) => {
		this.phrase = index === 1;
		if (this.phrase && !this.wordlist) {
			this.list = [];
			void this.#ensureWordlist();
			return;
		}
		this.regenerate();
	};

	retry = () => void this.#ensureWordlist();

	async #ensureWordlist() {
		if (this.wordStatus === 'loading') return;
		this.wordStatus = 'loading';
		try {
			this.wordlist = await loadWordlist();
		} catch (error) {
			console.error(
				'password-genny: wordlist fetch failed',
				error,
			);
			if (!this.isDestroyed) this.wordStatus = 'error';
			return;
		}
		if (this.isDestroyed) return;
		this.wordStatus = 'ready';
		if (this.phrase) this.regenerate();
	}

	setLength = (value: number) => {
		this.length = value;
		this.regenerate();
	};

	setClass = (key: ClassKey, on: boolean) => {
		this[key] = on;
		this.regenerate();
	};

	setAmbiguous = (on: boolean) => {
		this.excludeAmbiguous = on;
		this.regenerate();
	};

	setWords = (value: number) => {
		this.words = value;
		this.regenerate();
	};

	setSeparator = (index: number) => {
		this.separator = index;
		this.regenerate();
	};

	setCapitalise = (on: boolean) => {
		this.capitaliseFirst = on;
		this.regenerate();
	};

	setTrailingDigit = (on: boolean) => {
		this.trailingDigit = on;
		this.regenerate();
	};

	setCount = (index: number) => {
		this.count = BULK_COUNTS[index] ?? 10;
		this.regenerate();
	};

	select = (index: number) => {
		this.fades = false;
		if (index === this.shownIndex) return;
		this.selected = index;
		this.scrambleKey += 1;
	};

	copyAll = () => void this.toast.copy(this.list.join('\n'));

	download = () => downloadText(this.list.join('\n'), 'passwords.txt');

	<template>
		<CanonSplit class="password-genny">
			<:banner>
				<CanonCanvas
					@fitting={{true}}
					@animated={{true}}
				>
					<Picture
						@text={{this.shown}}
						@phrase={{this.phrase}}
						@spec={{this.spec}}
						@phraseSpec={{this.phraseSpec}}
						@rolls={{this.wordlist.rolls}}
						@bits={{this.bits}}
						@scrambleKey={{this.scrambleKey}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Mode" />
					<CanonSegmented
						@items={{MODES}}
						@selected={{this.modeIndex}}
						@onChange={{this.setMode}}
						aria-label="Mode"
					/>
					{{#if this.phrase}}
						<CanonRow
							@title="Words"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.words}}
								@min={{PASSPHRASE_MIN_WORDS}}
								@max={{PASSPHRASE_MAX_WORDS}}
								@labelledBy={{titleId}}
								@onChange={{this.setWords}}
							/>
						</CanonRow>
						<CanonHeading
							@text="Separator"
						/>
						<CanonSegmented
							@items={{SEPARATOR_TITLES}}
							@selected={{this.separator}}
							@onChange={{this.setSeparator}}
							aria-label="Separator"
						/>
						<CanonRow
							@title="Capitalise first"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.capitaliseFirst}}
								@onChange={{this.setCapitalise}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						<CanonRow
							@title="Trailing digit"
							as |titleId|
						>
							<CanonSwitch
								@on={{this.trailingDigit}}
								@onChange={{this.setTrailingDigit}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
						{{#if this.loading}}
							<CanonStatus
								@text="Loading…"
								@tone="muted"
								@row={{true}}
							/>
						{{/if}}
						{{#if this.failed}}
							<CanonStatus
								class="pw-error"
								@text={{WORDLIST_ERROR}}
								@tone="warn"
								@row={{true}}
								role="alert"
							/>
							<CanonButton
								class="pw-retry"
								@text="Retry"
								@icon={{Refresh}}
								@onClick={{this.retry}}
							/>
						{{/if}}
					{{else}}
						<CanonRow
							@title="Length"
							@form="flush"
							as |titleId|
						>
							<CanonNumberField
								@value={{this.length}}
								@min={{PASSWORD_MIN_LENGTH}}
								@max={{PASSWORD_MAX_LENGTH}}
								@labelledBy={{titleId}}
								@onChange={{this.setLength}}
							/>
						</CanonRow>
						<CanonHeading
							@text="Characters"
						/>
						<CanonGrid @columns={{2}}>
							{{#each
								this.classes
								key="key"
								as |c|
							}}
								<CanonRow
									@title={{c.title}}
									@sizingTitle="Lowercase"
									as |titleId|
								>
									<CanonSwitch
										@on={{c.on}}
										@disabled={{c.locked}}
										@onChange={{fn
											this.setClass
											c.key
										}}
										aria-labelledby={{titleId}}
									/>
								</CanonRow>
							{{/each}}
						</CanonGrid>
						<CanonRow
							class="pw-ambiguous"
							@title="Exclude ambiguous"
							@detail={{AMBIGUOUS_CHARS}}
							as |titleId|
						>
							<CanonSwitch
								@on={{this.excludeAmbiguous}}
								@onChange={{this.setAmbiguous}}
								aria-labelledby={{titleId}}
							/>
						</CanonRow>
					{{/if}}
					<CanonHeading @text="Count" />
					<CanonSegmented
						@items={{COUNT_TITLES}}
						@selected={{this.countIndex}}
						@onChange={{this.setCount}}
						aria-label="Count"
					/>
					<CanonButton
						@kind="primary"
						@text="Generate"
						@icon={{Refresh}}
						@iconStyle="oversized"
						@disabled={{this.blocked}}
						@onClick={{this.regenerate}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Generated" />
					<CanonGrid>
						<CanonButton
							@text="Copy all"
							@icon={{Copy}}
							@disabled={{this.empty}}
							@onClick={{this.copyAll}}
						/>
						<CanonButton
							@text="Download"
							@icon={{Download}}
							@disabled={{this.empty}}
							@onClick={{this.download}}
						/>
					</CanonGrid>
					{{#each
						this.rows key="@index"
						as |row index|
					}}
						<CanonValueLine
							class="pw-row"
							@layout="numbered"
							@wraps={{true}}
							@label={{row.number}}
							@value={{row.value}}
							@lit={{row.lit}}
							@fadeDelay={{row.fadeDelay}}
							@tint={{row.tint}}
							{{on
								"click"
								(fn
									this.select
									index
								)
							}}
						/>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
