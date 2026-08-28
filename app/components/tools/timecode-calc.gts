import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import {
	formatClock,
	formatTc,
	framesToSeconds,
	framesToTc,
	parseTc,
	RATES,
	rateById,
	type ParseError,
	type Parts,
} from 'delphitools-v2/lib/timecode';

type Op = '+' | '-';

const MESSAGE: Record<ParseError, string | null> = {
	empty: null,
	'not-numeric': 'Numbers only',
	'too-many': 'Too many fields',
	'frame-range': 'Frame too high',
	'seconds-range': 'Seconds too high',
	'minutes-range': 'Minutes too high',
};

interface Feedback {
	tone: 'error' | 'info';
	text: string;
	data?: string;
}

export default class TimecodeCalcTool extends Component {
	@tracked rateId = '29.97df';
	@tracked aInput = '';
	@tracked bInput = '';
	@tracked op: Op = '+';

	get rate() {
		return rateById(this.rateId);
	}

	get rates() {
		return RATES;
	}

	get placeholder() {
		return this.rate.drop ? '00:00:00;00' : '00:00:00:00';
	}

	get #a() {
		return parseTc(this.aInput, this.rate);
	}

	get #b() {
		return parseTc(this.bInput, this.rate);
	}

	get resultFrames(): number | null {
		const a = this.#a;
		if (!a.ok) return null;
		if (this.bInput.trim() === '') return a.frames;
		const b = this.#b;
		if (!b.ok) return a.frames;
		return this.op === '+'
			? a.frames + b.frames
			: a.frames - b.frames;
	}

	get #resultParts(): Parts | null {
		const f = this.resultFrames;
		return f === null ? null : framesToTc(f, this.rate);
	}

	get resultTc() {
		const p = this.#resultParts;
		return p ? formatTc(p, this.rate) : '—';
	}

	get resultFrameLabel() {
		return this.resultFrames === null
			? '—'
			: this.resultFrames.toLocaleString('en');
	}

	get resultClock() {
		const f = this.resultFrames;
		return f === null
			? '—'
			: formatClock(framesToSeconds(f, this.rate));
	}

	#feedback(
		input: string,
		parsed: ReturnType<typeof parseTc>,
	): Feedback | null {
		if (input.trim() === '') return null;
		if (!parsed.ok) {
			const text = MESSAGE[parsed.error];
			if (!text) return null;
			const data =
				parsed.detail && parsed.error === 'frame-range'
					? `00–${String(parsed.detail.max).padStart(2, '0')}`
					: undefined;
			return { tone: 'error', text, data };
		}
		if (parsed.snappedFrom) {
			return {
				tone: 'info',
				text: 'Dropped frame',
				data: `${parsed.snappedFrom} → ${formatTc(parsed.parts, this.rate)}`,
			};
		}
		return null;
	}

	get aFeedback() {
		return this.#feedback(this.aInput, this.#a);
	}

	get bFeedback() {
		return this.#feedback(this.bInput, this.#b);
	}

	pickRate = (id: string) => {
		this.rateId = id;
	};

	setA = (event: Event) => {
		this.aInput = (event.target as HTMLInputElement).value;
	};

	setB = (event: Event) => {
		this.bInput = (event.target as HTMLInputElement).value;
	};

	setOp = (op: Op) => {
		this.op = op;
	};

	copyResult = () => {
		if (this.resultFrames !== null) {
			void navigator.clipboard?.writeText(this.resultTc);
		}
	};

	<template>
		<div class="dt-tcc">
			<div
				class="segmented dt-tcc-rates"
				role="group"
				aria-label="Frame rate"
			>
				{{#each this.rates key="id" as |r|}}
					<button
						type="button"
						class="dt-tcc-rate
							{{if
								(eq
									r.id
									this.rateId
								)
								'is-active'
							}}"
						{{on
							"click"
							(fn this.pickRate r.id)
						}}
					>{{r.label}}</button>
				{{/each}}
			</div>

			<div class="dt-tcc-strip">
				<div class="dt-tcc-cell">
					<label
						class="dt-tcc-label"
						for="dt-tcc-a"
					>Timecode A</label>
					<input
						id="dt-tcc-a"
						class="dt-tcc-input"
						inputmode="numeric"
						autocomplete="off"
						spellcheck="false"
						placeholder={{this.placeholder}}
						value={{this.aInput}}
						{{on "input" this.setA}}
					/>
					{{#if this.aFeedback}}
						<p
							class="dt-tcc-msg
								{{this.aFeedback.tone}}"
						>
							<span
							>{{this.aFeedback.text}}</span>
							{{#if
								this.aFeedback.data
							}}
								<code
								>{{this.aFeedback.data}}</code>
							{{/if}}
						</p>
					{{/if}}
				</div>

				<div class="segmented dt-tcc-op">
					<button
						type="button"
						class="dt-tcc-op-cell
							{{if
								(eq this.op '+')
								'is-active'
							}}"
						aria-label="Add"
						{{on
							"click"
							(fn this.setOp "+")
						}}
					>+</button>
					<button
						type="button"
						class="dt-tcc-op-cell
							{{if
								(eq this.op '-')
								'is-active'
							}}"
						aria-label="Subtract"
						{{on
							"click"
							(fn this.setOp "-")
						}}
					>−</button>
				</div>

				<div class="dt-tcc-cell">
					<label
						class="dt-tcc-label"
						for="dt-tcc-b"
					>Timecode B</label>
					<input
						id="dt-tcc-b"
						class="dt-tcc-input"
						inputmode="numeric"
						autocomplete="off"
						spellcheck="false"
						placeholder={{this.placeholder}}
						value={{this.bInput}}
						{{on "input" this.setB}}
					/>
					{{#if this.bFeedback}}
						<p
							class="dt-tcc-msg
								{{this.bFeedback.tone}}"
						>
							<span
							>{{this.bFeedback.text}}</span>
							{{#if
								this.bFeedback.data
							}}
								<code
								>{{this.bFeedback.data}}</code>
							{{/if}}
						</p>
					{{/if}}
				</div>
			</div>

			<button
				type="button"
				class="dt-tcc-result"
				aria-label="Copy result"
				{{on "click" this.copyResult}}
			>
				<span
					class="dt-tcc-result-tc"
				>{{this.resultTc}}</span>
				<Icon @name="copy" />
			</button>

			<dl class="dt-tcc-readout">
				<div class="dt-tcc-readout-cell">
					<dt>Frames</dt>
					<dd>{{this.resultFrameLabel}}</dd>
				</div>
				<div class="dt-tcc-readout-cell">
					<dt>Real time</dt>
					<dd>{{this.resultClock}}</dd>
				</div>
			</dl>
		</div>
	</template>
}
