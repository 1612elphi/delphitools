import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import type { Cue } from 'delphitools-v2/lib/subtitles';
import './cue-timeline.css';

export interface CueLane {
	cues: Cue[];
	label?: string;
	lit?: boolean;
	active?: number | null;
}

export interface CueTimelineSignature {
	Args: {
		lanes: CueLane[];
		span?: number;
		playhead?: number | null;
		onScrub?: (seconds: number) => void;
		onCue?: (index: number) => void;
		label?: string;
	};
	Element: HTMLDivElement;
}

export function blocks(cues: Cue[], span: number) {
	return cues.map((cue) =>
		htmlSafe(
			`inset-inline-start: ${(Math.max(0, cue.start) / span) * 100}%; inline-size: ${((cue.end - cue.start) / span) * 100}%`,
		),
	);
}

export const cueAt = (cues: Cue[], ms: number) =>
	cues.findIndex((cue) => ms >= cue.start && ms < cue.end);

export default class CueTimeline extends Component<CueTimelineSignature> {
	get span() {
		if (this.args.span && this.args.span > 0) return this.args.span;
		let end = 1;
		for (const lane of this.args.lanes)
			for (const cue of lane.cues)
				end = Math.max(end, cue.end);
		return end;
	}

	get labelled() {
		return this.args.lanes.some((lane) => lane.label !== undefined);
	}

	// ponytail: one span per cue; a canvas if files of many thousand cues lag
	get lanes() {
		const span = this.span;
		return this.args.lanes.map((lane) => ({
			lane,
			blocks: blocks(lane.cues, span).map((style, index) => ({
				style,
				active: index === lane.active,
			})),
		}));
	}

	get showsHead() {
		return typeof this.args.playhead === 'number';
	}

	get headStyle() {
		const share = Math.min(
			Math.max(
				((this.args.playhead ?? 0) * 1000) / this.span,
				0,
			),
			1,
		);
		return htmlSafe(`inset-inline-start: ${share * 100}%`);
	}

	get presses() {
		return !!(this.args.onScrub || this.args.onCue);
	}

	#msAt(element: HTMLElement, clientX: number) {
		const box = element.getBoundingClientRect();
		let share = (clientX - box.left) / Math.max(1, box.width);
		if (getComputedStyle(element).direction === 'rtl')
			share = 1 - share;
		return Math.min(Math.max(share, 0), 1) * this.span;
	}

	pressing = modifier((element: HTMLElement, [cues]: [Cue[]]) => {
		const down = (event: PointerEvent) => {
			if (!this.presses || event.button !== 0) return;
			const ms = this.#msAt(element, event.clientX);
			const index = cueAt(cues, ms);
			if (index >= 0 && this.args.onCue)
				return this.args.onCue(index);
			element.setPointerCapture(event.pointerId);
			this.args.onScrub?.(ms / 1000);
		};
		const move = (event: PointerEvent) => {
			if (element.hasPointerCapture(event.pointerId))
				this.args.onScrub?.(
					this.#msAt(element, event.clientX) /
						1000,
				);
		};
		element.addEventListener('pointerdown', down);
		element.addEventListener('pointermove', move);
		return () => {
			element.removeEventListener('pointerdown', down);
			element.removeEventListener('pointermove', move);
		};
	});

	<template>
		<div
			class="cue-timeline
				{{if this.labelled 'cue-timeline--labelled'}}
				{{if this.presses 'cue-timeline--presses'}}"
			role={{if @label "img"}}
			aria-label={{@label}}
			aria-hidden={{unless @label "true"}}
			...attributes
		>
			{{#each this.lanes as |row|}}
				{{#if this.labelled}}
					<span
						class="cue-timeline-label
							{{if
								row.lane.lit
								'cue-timeline-label--lit'
							}}"
					>{{row.lane.label}}</span>
				{{/if}}
				<span
					class="cue-timeline-lane
						{{if
							row.lane.lit
							'cue-timeline-lane--lit'
						}}"
					{{this.pressing row.lane.cues}}
				>
					{{#each row.blocks as |block|}}
						<span
							class="cue-timeline-cue
								{{if
									block.active
									'cue-timeline-cue--active'
								}}"
							style={{block.style}}
						></span>
					{{/each}}
					{{#if this.showsHead}}
						<span
							class="cue-timeline-head"
							style={{this.headStyle}}
						></span>
					{{/if}}
				</span>
			{{/each}}
		</div>
	</template>
}
