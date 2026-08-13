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

// Feedback is microcopy kept to <= 3 words so it is not gap-worthy; the
// specifics (the legal frame range, the snapped value) render beside it as
// data, not prose.
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
		if (!b.ok) return a.frames; // a second, invalid operand does not poison A
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

	setRate = (event: Event) => {
		this.rateId = (event.target as HTMLSelectElement).value;
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
		<div class="dt-tc">
			<div class="dt-tc-rate">
				<label for="dt-tc-rate">Frame rate</label>
				<select
					id="dt-tc-rate"
					class="dt-tc-select"
					{{on "change" this.setRate}}
				>
					{{#each this.rates key="id" as |r|}}
						<option
							value={{r.id}}
							selected={{eq
								r.id
								this.rateId
							}}
						>{{r.label}}</option>
					{{/each}}
				</select>
			</div>

			<div class="dt-tc-grid">
				<div class="dt-tc-cell">
					<label for="dt-tc-a">Timecode A</label>
					<input
						id="dt-tc-a"
						class="dt-tc-input"
						inputmode="numeric"
						autocomplete="off"
						spellcheck="false"
						placeholder={{this.placeholder}}
						value={{this.aInput}}
						{{on "input" this.setA}}
					/>
					{{#if this.aFeedback}}
						<p
							class="dt-tc-msg
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

				<div class="segmented dt-tc-op">
					<button
						type="button"
						class="dt-tc-op-cell
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
						class="dt-tc-op-cell
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

				<div class="dt-tc-cell">
					<label for="dt-tc-b">Timecode B</label>
					<input
						id="dt-tc-b"
						class="dt-tc-input"
						inputmode="numeric"
						autocomplete="off"
						spellcheck="false"
						placeholder={{this.placeholder}}
						value={{this.bInput}}
						{{on "input" this.setB}}
					/>
					{{#if this.bFeedback}}
						<p
							class="dt-tc-msg
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

			<div class="dt-tc-result">
				<button
					type="button"
					class="dt-tc-tc"
					aria-label="Copy result"
					{{on "click" this.copyResult}}
				>
					<span>{{this.resultTc}}</span>
					<Icon @name="copy" />
				</button>
				<dl class="dt-tc-readout">
					<div>
						<dt>Frames</dt>
						<dd
						>{{this.resultFrameLabel}}</dd>
					</div>
					<div>
						<dt>Real time</dt>
						<dd>{{this.resultClock}}</dd>
					</div>
				</dl>
			</div>
		</div>
	</template>
}
