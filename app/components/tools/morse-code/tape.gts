import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonGlyphFlow from 'delphicanon/components/canon-glyph-flow';
import type { GlyphKind } from 'delphicanon/lib/glyph-rows';
import { FROM_MORSE } from 'delphitools-v2/lib/morse';
import {
	fitUnit,
	glyphAt,
	marksOf,
	tapeOf,
	units,
	type TapeGlyph,
} from 'delphitools-v2/components/tools/morse-code/layout';

interface TapeSignature {
	Args: {
		morse: string;
		step?: number;
		label: string;
	};
}

export const stripHeight = 118;
export const collapsedStrip = 70;

const mark = 7;
const flowPadding = 32;

const kind = (glyph: TapeGlyph): GlyphKind => (glyph.code ? 'glyph' : 'space');
const equals = (a: TapeGlyph, b: TapeGlyph) =>
	a.code === b.code && a.label === b.label;

export default class Tape extends Component<TapeSignature> {
	@tracked width = 0;

	measureWidth = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width ?? 0;
			if (width !== this.width) this.width = width;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	@cached
	get tape() {
		return tapeOf(this.args.morse);
	}

	get unit() {
		return fitUnit(this.tape.total, this.width - flowPadding);
	}

	get metrics() {
		return { height: mark + 22, rowGap: 12, gap: 3 * this.unit };
	}

	get focus() {
		const { step } = this.args;
		return step === undefined
			? undefined
			: glyphAt(this.tape.starts, step);
	}

	get style() {
		return htmlSafe(`--mt-reach: ${(3 * this.unit) / 2}px`);
	}

	measure = (glyph: TapeGlyph) => units(glyph.code) * this.unit;

	played(index: number | null) {
		const { step } = this.args;
		if (step === undefined || index === null) return undefined;
		return step - (this.tape.starts[index] ?? 0);
	}

	marks = (glyph: TapeGlyph, index: number | null) => {
		const played = this.played(index);
		const stopped = this.args.step === undefined;
		return marksOf(glyph.code).map(({ at, length }) => {
			const lit = played !== undefined && played >= at;
			const sounding = lit && played < at + length;
			return {
				state: sounding
					? 'sounding'
					: lit
						? 'lit'
						: stopped
							? 'still'
							: 'dim',
				style: htmlSafe(
					`left: ${at * this.unit}px; width: ${length * this.unit}px`,
				),
			};
		});
	};

	labelState = (glyph: TapeGlyph, index: number | null) => {
		if (FROM_MORSE[glyph.code] === undefined) return 'unknown';
		return (this.played(index) ?? -1) >= 0 ? 'lit' : 'still';
	};

	<template>
		<div class="mt-tape" style={{this.style}} {{this.measureWidth}}>
			<CanonGlyphFlow
				@glyphs={{this.tape.glyphs}}
				@metrics={{this.metrics}}
				@measure={{this.measure}}
				@kind={{kind}}
				@equals={{equals}}
				@focus={{this.focus}}
				@label={{@label}}
			>
				<:default as |glyph index|>
					<span class="mt-line"></span>
					{{#if glyph.code}}
						{{#each
							(this.marks glyph index)
							as |m|
						}}
							<span
								class="mt-mark mt-mark--{{m.state}}"
								style={{m.style}}
							></span>
						{{/each}}
						<span
							class="mt-label mt-label--{{this.labelState
									glyph
									index
								}}"
						>{{glyph.label}}</span>
					{{/if}}
				</:default>
				<:empty>
					<span class="mt-blank"></span>
				</:empty>
			</CanonGlyphFlow>
		</div>
	</template>
}
