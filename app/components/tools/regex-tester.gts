import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import Picture from 'delphitools-v2/components/tools/regex-tester/picture';
import {
	matchesHeading,
	matchLines,
	runRegex,
	type RegexOutcome,
} from 'delphitools-v2/components/tools/regex-tester/regex';
import './regex-tester/regex-tester.css';

const typingDelay = 400;
const timeLimit = 400;

const WORKER_SOURCE = `const run = ${runRegex.toString()};
self.onmessage = (event) => {
	const { seq, pattern, flags, text } = event.data;
	self.postMessage({ seq, outcome: run(pattern, flags, text) });
};`;

const flagOptions = [
	{ flag: 'g', label: 'Global' },
	{ flag: 'i', label: 'Case insensitive' },
	{ flag: 'm', label: 'Multiline' },
	{ flag: 's', label: 'Dotall' },
];

const presets = [
	{
		name: 'Email',
		pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}',
	},
	{ name: 'URL', pattern: 'https?://[^\\s]+' },
	{ name: 'Phone', pattern: '\\+?[\\d\\s()-]{7,}' },
	{ name: 'Date', pattern: '\\d{1,4}[-/.]\\d{1,2}[-/.]\\d{1,4}' },
];

const samplePattern = String.raw`([\w.]+)@([\w-]+\.\w+)`;
const sampleText = `Ruby <ruby@delphi.tools> filed this on 2026-09-25, cc bob.smith@example.org.
Call +44 20 7946 0958 or visit https://delphi.tools/regex-tester today.
Invoice #4471 is due 2026-10-01; support@delphi-tools.co.uk has a copy.`;

const CopyIcon = <template><IconSvg @name="copy" /></template>;

export default class RegexTester extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked pattern = '';
	@tracked flags = 'g';
	@tracked text = '';
	@tracked outcome: RegexOutcome = { kind: 'empty' };
	@tracked shownText = '';
	@tracked pictureHeight?: number;

	#worker?: Worker;
	#workerUrl?: string;
	#seq = 0;
	#sentText = '';
	#runTimer?: number;
	#typingTimer?: number;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const sample = query.has('regexSample');
		this.pattern =
			query.get('regexPattern') ??
			(sample ? samplePattern : '');
		this.flags = (query.get('regexFlags') ?? 'g').replace(
			/[^gims]/g,
			'',
		);
		this.text =
			query.get('regexText') ?? (sample ? sampleText : '');
		this.refresh();
	}

	willDestroy() {
		super.willDestroy();
		window.clearTimeout(this.#typingTimer);
		this.#stopWorker();
	}

	get flagCells() {
		return flagOptions.map((option) => ({
			...option,
			title: `${option.flag}  ${option.label}`,
			active: this.flags.includes(option.flag),
		}));
	}

	get presets() {
		return presets;
	}

	get error() {
		const { outcome } = this;
		if (outcome.kind === 'invalid') return outcome.message;
		if (outcome.kind === 'timedOut') return 'Pattern timed out';
		return undefined;
	}

	get matched() {
		const { outcome } = this;
		return outcome.kind === 'matched' && this.shownText
			? outcome
			: undefined;
	}

	get heading() {
		const { matched } = this;
		return matched
			? matchesHeading(
					matched.matches.length,
					matched.truncated,
				)
			: 'Matches';
	}

	get lines() {
		const { matched } = this;
		return matched
			? matchLines(this.shownText, matched.matches)
			: [];
	}

	#stopWorker() {
		window.clearTimeout(this.#runTimer);
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
			const { seq, outcome } = event.data as {
				seq: number;
				outcome: RegexOutcome;
			};
			if (seq !== this.#seq) return;
			window.clearTimeout(this.#runTimer);
			this.shownText = this.#sentText;
			this.outcome = outcome;
		};
		this.#worker = worker;
		return worker;
	}

	refresh() {
		window.clearTimeout(this.#typingTimer);
		const seq = ++this.#seq;
		window.clearTimeout(this.#runTimer);
		if (!this.pattern) {
			this.shownText = this.text;
			this.outcome = { kind: 'empty' };
			return;
		}
		this.#sentText = this.text;
		this.#ensureWorker().postMessage({
			seq,
			pattern: this.pattern,
			flags: this.flags,
			text: this.text,
		});
		this.#runTimer = window.setTimeout(() => {
			if (seq !== this.#seq) return;
			this.#stopWorker();
			this.shownText = this.#sentText;
			this.outcome = { kind: 'timedOut' };
		}, timeLimit);
	}

	typePattern = (value: string) => {
		this.pattern = value;
		window.clearTimeout(this.#typingTimer);
		this.#typingTimer = window.setTimeout(
			() => this.refresh(),
			typingDelay,
		);
	};

	setText = (text: string) => {
		this.text = text;
		this.refresh();
	};

	toggle = (flag: string) => {
		this.flags = this.flags.includes(flag)
			? this.flags.replaceAll(flag, '')
			: this.flags + flag;
		this.refresh();
	};

	usePreset = (pattern: string) => {
		this.pattern = pattern;
		this.flags = 'g';
		this.refresh();
	};

	copyPattern = () =>
		void this.toast.copy(`/${this.pattern}/${this.flags}`);

	measured = (height: number) => {
		if (height + 2 !== this.pictureHeight)
			this.pictureHeight = height + 2;
	};

	<template>
		<CanonSplit
			class="regex-tester"
			@halves={{true}}
			@collapsesTo={{150}}
		>
			<:sidebar>
				<CanonCanvas @height={{this.pictureHeight}}>
					<Picture
						@text={{this.text}}
						@shownText={{this.shownText}}
						@onInput={{this.setText}}
						@outcome={{this.outcome}}
						@onHeight={{this.measured}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Pattern" />
					<div class="rx-pattern">
						<label class="rx-pattern-cell">
							<span
								class="rx-slash"
								aria-hidden="true"
							>/</span>
							<CanonTextCell
								class="rx-pattern-field"
								@value={{this.pattern}}
								@placeholder="Pattern"
								@onChange={{this.typePattern}}
								aria-label="Pattern"
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
							/>
							<span
								class="rx-slash"
								aria-hidden="true"
							>/</span>
							<span
								class="rx-pattern-flags"
							>{{this.flags}}</span>
						</label>
						<CanonButton
							@kind="cell"
							@icon={{CopyIcon}}
							@label="Copy Pattern"
							@onClick={{this.copyPattern}}
						/>
					</div>
					{{#if this.error}}
						<CanonStatus
							@text={{this.error}}
							@tone="warn"
							@row={{true}}
						/>
					{{/if}}
					<CanonHeading @text="Options" />
					<CanonGrid
						class="rx-flags"
						@columns={{2}}
					>
						{{#each
							this.flagCells
							as |cell|
						}}
							<CanonButton
								@kind="segment"
								@text={{cell.title}}
								@selected={{cell.active}}
								@onClick={{fn
									this.toggle
									cell.flag
								}}
								aria-pressed={{if
									cell.active
									"true"
									"false"
								}}
							/>
						{{/each}}
					</CanonGrid>
					<CanonHeading @text="Presets" />
					<CanonGrid @columns={{4}}>
						{{#each
							this.presets
							as |preset|
						}}
							<CanonButton
								@kind="cell"
								@text={{preset.name}}
								@onClick={{fn
									this.usePreset
									preset.pattern
								}}
							/>
						{{/each}}
					</CanonGrid>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text={{this.heading}} />
					{{#each
						this.lines key="@index"
						as |line|
					}}
						<CanonValueLine
							class="rx-line rx-line--{{line.tint}}"
							@layout="numbered"
							@wraps={{true}}
							@label={{line.label}}
							@value={{line.value}}
						/>
					{{else}}
						<CanonEmptyRow @text="None" />
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
