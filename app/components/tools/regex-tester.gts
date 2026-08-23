import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import Icon from 'delphitools-v2/components/icon';

export interface RegexMatch {
	match: string;
	index: number;
	groups: string[];
}

export interface RegexResult {
	valid: boolean;
	matches: RegexMatch[];
	error: string | null;
	/** True when `limit` cut the match list short. */
	truncated: boolean;
}

export interface HighlightPart {
	text: string;
	isMatch: boolean;
}

/**
 * Runs one user-supplied pattern over one test string.
 *
 * Written without a single reference to module scope, because the component
 * stringifies it into a worker (see WORKER_SOURCE). Anything it closed over
 * would be undefined there.
 */
export function runRegex(
	pattern: string,
	flags: string,
	testString: string,
	limit = 1000,
): RegexResult {
	if (!pattern)
		return {
			valid: true,
			matches: [],
			error: null,
			truncated: false,
		};

	let regex: RegExp;
	try {
		regex = new RegExp(pattern, flags);
	} catch (error) {
		return {
			valid: false,
			matches: [],
			error:
				error instanceof Error
					? error.message
					: 'Invalid regex',
			truncated: false,
		};
	}

	const matches: RegexMatch[] = [];
	let truncated = false;

	if (!flags.includes('g')) {
		const match = regex.exec(testString);
		if (match)
			matches.push({
				match: match[0],
				index: match.index,
				groups: match.slice(1).map((g) => g ?? ''),
			});
		return { valid: true, matches, error: null, truncated };
	}

	for (
		let match = regex.exec(testString);
		match !== null;
		match = regex.exec(testString)
	) {
		if (matches.length >= limit) {
			truncated = true;
			break;
		}
		matches.push({
			match: match[0],
			index: match.index,
			groups: match.slice(1).map((g) => g ?? ''),
		});
		// A zero-width match leaves lastIndex where it was, so exec would
		// return the same match for ever.
		if (match[0].length === 0) regex.lastIndex++;
	}

	return { valid: true, matches, error: null, truncated };
}

/**
 * Splits the test string into matched and unmatched runs.
 *
 * The Next app re-ran the regex a second time to build this; the match list
 * already carries every index and length, so one pass over it is enough. Every
 * part is rendered as a text node, never as markup.
 */
export function highlightParts(
	testString: string,
	matches: RegexMatch[],
): HighlightPart[] {
	const parts: HighlightPart[] = [];
	let lastIndex = 0;

	for (const m of matches) {
		if (m.index > lastIndex)
			parts.push({
				text: testString.slice(lastIndex, m.index),
				isMatch: false,
			});
		// Zero-width matches would produce an empty, invisible <mark>.
		if (m.match) parts.push({ text: m.match, isMatch: true });
		lastIndex = m.index + m.match.length;
	}

	if (lastIndex < testString.length)
		parts.push({
			text: testString.slice(lastIndex),
			isMatch: false,
		});

	return parts;
}

export interface MatchRow {
	key: string;
	number: number;
	value: string;
	isEmpty: boolean;
	position: string;
	groups: { key: string; label: string; value: string }[];
}

export function matchRows(matches: RegexMatch[]): MatchRow[] {
	return matches.map((m, i) => ({
		key: `${i}-${m.index}`,
		number: i + 1,
		value: m.match,
		isEmpty: m.match.length === 0,
		// wording carried over from the Next app
		position: `index: ${m.index}`,
		groups: m.groups.map((value, gi) => ({
			key: `${i}-${gi}`,
			label: `$${gi + 1}:`,
			value,
		})),
	}));
}

/** Wording carried over from the Next app: "1 Match", "4 Matches". */
export function matchLabel(count: number, truncated = false): string {
	if (truncated) return `${count}+ Matches`;
	return `${count} Match${count === 1 ? '' : 'es'}`;
}

const EMPTY_RESULT: RegexResult = {
	valid: true,
	matches: [],
	error: null,
	truncated: false,
};

/**
 * Catastrophic backtracking cannot be interrupted: a runaway exec() never
 * yields to a message, a flag or a timer. Terminating the thread it runs on is
 * the only stop, so the pattern runs in a worker and the main thread gives it
 * this long before killing it.
 */
const TIMEOUT_MS = 400;
const COPIED_MS = 1500;

const WORKER_SOURCE = `const run = ${runRegex.toString()};
self.onmessage = (event) => {
	const { seq, pattern, flags, testString } = event.data;
	self.postMessage({ seq, result: run(pattern, flags, testString) });
};`;

// Wording carried over from the Next app. Held here rather than inline in the
// template because the formatter wraps long attribute values, and a placeholder
// keeps the line break it is given.
const PATTERN_PLACEHOLDER = 'Enter regex pattern…';
const TEST_PLACEHOLDER = 'Enter text to test against…';

const TIMEOUT_ERROR = 'Pattern timed out';

const FLAG_OPTIONS: { flag: string; label: string }[] = [
	{ flag: 'g', label: 'Global' },
	{ flag: 'i', label: 'Case insensitive' },
	{ flag: 'm', label: 'Multiline' },
	{ flag: 's', label: 'Dotall' },
];

const PRESETS: { label: string; pattern: string }[] = [
	{
		label: 'Email',
		pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
	},
	{
		label: 'URL',
		pattern: "https?:\\/\\/[\\w\\-._~:/?#[\\]@!$&'()*+,;=%]+",
	},
	{ label: 'Phone', pattern: '\\+?[\\d\\s\\-().]{10,}' },
	{ label: 'Date', pattern: '\\d{4}-\\d{2}-\\d{2}' },
];

export default class RegexTesterTool extends Component {
	@tracked pattern = '';
	@tracked flags = 'g';
	@tracked testString = '';
	@tracked copied = false;
	@tracked result: RegexResult = EMPTY_RESULT;

	#worker?: Worker;
	#workerUrl?: string;
	#seq = 0;
	#runTimer?: ReturnType<typeof setTimeout>;
	#copiedTimer?: ReturnType<typeof setTimeout>;

	willDestroy() {
		super.willDestroy();
		clearTimeout(this.#copiedTimer);
		this.#stopWorker();
	}

	get patternPlaceholder() {
		return PATTERN_PLACEHOLDER;
	}

	get testPlaceholder() {
		return TEST_PLACEHOLDER;
	}

	get flagOptions() {
		return FLAG_OPTIONS.map((option) => ({
			...option,
			active: this.flags.includes(option.flag),
		}));
	}

	get presets() {
		return PRESETS;
	}

	get showHighlight() {
		return Boolean(
			this.testString && this.pattern && this.result.valid,
		);
	}

	get highlight() {
		return highlightParts(this.testString, this.result.matches);
	}

	get rows() {
		return matchRows(this.result.matches);
	}

	get countLabel() {
		return matchLabel(
			this.result.matches.length,
			this.result.truncated,
		);
	}

	#stopWorker() {
		clearTimeout(this.#runTimer);
		this.#worker?.terminate();
		this.#worker = undefined;
		if (this.#workerUrl) URL.revokeObjectURL(this.#workerUrl);
		this.#workerUrl = undefined;
	}

	#ensureWorker(): Worker {
		if (this.#worker) return this.#worker;

		this.#workerUrl = URL.createObjectURL(
			new Blob([WORKER_SOURCE], { type: 'text/javascript' }),
		);
		const worker = new Worker(this.#workerUrl);
		worker.onmessage = (event: MessageEvent) => {
			const { seq, result } = event.data as {
				seq: number;
				result: RegexResult;
			};
			if (seq !== this.#seq) return;
			clearTimeout(this.#runTimer);
			this.result = result;
		};
		this.#worker = worker;
		return worker;
	}

	#evaluate() {
		const seq = ++this.#seq;
		clearTimeout(this.#runTimer);

		if (!this.pattern) {
			this.result = EMPTY_RESULT;
			return;
		}

		this.#ensureWorker().postMessage({
			seq,
			pattern: this.pattern,
			flags: this.flags,
			testString: this.testString,
		});

		this.#runTimer = setTimeout(() => {
			if (seq !== this.#seq) return;
			this.#stopWorker();
			this.result = {
				valid: false,
				matches: [],
				error: TIMEOUT_ERROR,
				truncated: false,
			};
		}, TIMEOUT_MS);
	}

	setPattern = (event: Event) => {
		this.pattern = (event.target as HTMLInputElement).value;
		this.#evaluate();
	};

	setFlags = (event: Event) => {
		this.flags = (event.target as HTMLInputElement).value;
		this.#evaluate();
	};

	setTestString = (event: Event) => {
		this.testString = (event.target as HTMLTextAreaElement).value;
		this.#evaluate();
	};

	// replaceAll, where the Next app used replace: typing "gg" into the flags
	// field left one g behind, and RegExp rejects a repeated flag.
	toggleFlag = (flag: string) => {
		this.flags = this.flags.includes(flag)
			? this.flags.replaceAll(flag, '')
			: this.flags + flag;
		this.#evaluate();
	};

	usePreset = (pattern: string) => {
		this.pattern = pattern;
		this.#evaluate();
	};

	copyPattern = () => void this.copy();

	async copy() {
		await navigator.clipboard.writeText(
			`/${this.pattern}/${this.flags}`,
		);
		this.copied = true;
		clearTimeout(this.#copiedTimer);
		this.#copiedTimer = setTimeout(
			() => (this.copied = false),
			COPIED_MS,
		);
	}

	<template>
		<div class="dt-rx">
			<div class="dt-rx-section">
				{{! wording carried over from the Next app }}
				<label
					class="dt-rx-label"
					for="dt-rx-pattern"
				>Regular Expression</label>
				<div class="dt-rx-pattern">
					<span class="dt-rx-slash">/</span>
					<input
						id="dt-rx-pattern"
						type="text"
						class="dt-rx-input"
						spellcheck="false"
						autocomplete="off"
						value={{this.pattern}}
						placeholder={{this.patternPlaceholder}}
						{{on "input" this.setPattern}}
					/>
					<span class="dt-rx-slash">/</span>
					<span class="dt-rx-flags-cell">
						<input
							type="text"
							class="dt-rx-flags-input"
							spellcheck="false"
							autocomplete="off"
							aria-label="Flags"
							value={{this.flags}}
							{{on
								"input"
								this.setFlags
							}}
						/>
					</span>
				</div>
			</div>

			<div class="dt-rx-section">
				{{! wording carried over from the Next app }}
				<span class="dt-rx-label">Flags</span>
				<div class="segmented dt-rx-options">
					{{#each
						this.flagOptions key="flag"
						as |option|
					}}
						<button
							type="button"
							class="dt-rx-option
								{{if
									option.active
									'is-active'
								}}"
							aria-pressed={{if
								option.active
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.toggleFlag
									option.flag
								)
							}}
						>
							<span
								class="dt-rx-flag-letter"
							>{{option.flag}}</span>
							{{! wording carried over from the Next app }}
							{{option.label}}
						</button>
					{{/each}}
				</div>
			</div>

			<div class="dt-rx-section">
				{{! wording carried over from the Next app }}
				<span class="dt-rx-label">Presets</span>
				<div class="segmented dt-rx-options">
					{{#each
						this.presets key="label"
						as |preset|
					}}
						<button
							type="button"
							class="dt-rx-option"
							{{on
								"click"
								(fn
									this.usePreset
									preset.pattern
								)
							}}
						>
							{{! wording carried over from the Next app }}
							{{preset.label}}
						</button>
					{{/each}}
				</div>
			</div>

			{{#if this.result.error}}
				<div class="dt-rx-error" role="alert">
					<Icon @name="circle-alert" />
					<span
						class="dt-rx-error-text"
					>{{this.result.error}}</span>
				</div>
			{{/if}}

			<div class="dt-rx-section">
				{{! wording carried over from the Next app }}
				<label class="dt-rx-label" for="dt-rx-test">Test
					String</label>
				<textarea
					id="dt-rx-test"
					class="dt-rx-textarea"
					spellcheck="false"
					placeholder={{this.testPlaceholder}}
					value={{this.testString}}
					{{on "input" this.setTestString}}
				></textarea>
			</div>

			{{#if this.showHighlight}}
				<div class="dt-rx-section">
					{{! wording carried over from the Next app }}
					<span class="dt-rx-label">Highlighted
						Matches</span>
					<div class="dt-rx-preview">
						{{#each
							this.highlight
							key="@index"
							as |part|
						}}
							{{#if part.isMatch}}
								<mark
									class="dt-rx-mark"
								>{{part.text}}</mark>
							{{else}}
								<span
								>{{part.text}}</span>
							{{/if}}
						{{/each}}
					</div>
				</div>
			{{/if}}

			{{#if this.rows}}
				<div class="dt-rx-results">
					<div class="dt-rx-results-head">
						<span
							class="dt-rx-label"
						>{{this.countLabel}}</span>
						<button
							type="button"
							class="dt-rx-copy"
							{{on
								"click"
								this.copyPattern
							}}
						>
							<Icon
								@name={{if
									this.copied
									"check"
									"copy"
								}}
							/>
							{{! wording carried over from the Next app }}
							{{if
								this.copied
								"Copied!"
								"Copy pattern"
							}}
						</button>
					</div>

					{{#each this.rows key="key" as |row|}}
						<div class="dt-rx-match">
							<div
								class="dt-rx-match-row"
							>
								<span
									class="dt-rx-match-num"
								>{{row.number}}</span>
								<span
									class="dt-rx-match-value"
								>
									{{#if
										row.isEmpty
									}}
										{{! wording carried over from the Next app }}
										<span
											class="dt-rx-match-blank"
										>empty</span>
									{{else}}
										{{row.value}}
									{{/if}}
								</span>
								<span
									class="dt-rx-match-pos"
								>{{row.position}}</span>
							</div>

							{{#if row.groups}}
								<div
									class="dt-rx-groups"
								>
									{{! wording carried over from the Next app }}
									<span
										class="dt-rx-group-heading"
									>Groups:</span>
									{{#each
										row.groups
										key="key"
										as |group|
									}}
										<span
											class="dt-rx-group"
										>
											<span
												class="dt-rx-group-label"
											>{{group.label}}</span>
											<strong
											>{{group.value}}</strong>
										</span>
									{{/each}}
								</div>
							{{/if}}
						</div>
					{{/each}}
				</div>
			{{/if}}
		</div>
	</template>
}
