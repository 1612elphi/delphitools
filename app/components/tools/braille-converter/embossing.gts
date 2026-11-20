import Component from '@glimmer/component';
import CanonGlyphFlow from 'delphicanon/components/canon-glyph-flow';
import type { GlyphKind } from 'delphicanon/lib/glyph-rows';
import { dots, type Reading } from 'delphitools-v2/lib/braille';

type Tone = 'cell' | 'indicator' | 'plain' | 'space' | 'newline';

export interface Glyph {
	cell: string;
	label: string;
	tone: Tone;
}

interface EmbossingSignature {
	Args: {
		readings: Reading[];
		label: string;
	};
}

const dot = { pitch: 10, radius: 3.2, gap: 8 };
const cellWidth = dot.pitch + dot.radius * 2;
const labelRoom = 18;
const cellHeight = (rows: number) => dot.pitch * (rows - 1) + dot.radius * 2;

export const bandHeight = 150;
export const collapsedHeight = 84;

function mask(cell: string): number | undefined {
	const code = cell.codePointAt(0) ?? 0;
	return code >= 0x2800 && code <= 0x28ff ? code - 0x2800 : undefined;
}

function position(bit: number): [column: number, row: number] {
	if (bit < 3) return [0, bit];
	if (bit < 6) return [1, bit - 3];
	return [bit === 6 ? 0 : 1, 3];
}

function indicatorLabel(cells: string) {
	const first = dots(cells.slice(0, 1));
	if (first === '6') return '⇧';
	if (first === '3-4-5-6') return '#';
	return '';
}

export function glyphsOf(readings: Reading[]): Glyph[] {
	const glyphs: Glyph[] = [];
	for (const reading of readings) {
		[...reading.cells].forEach((cell, index) => {
			let tone: Tone;
			if (cell === '\n') tone = 'newline';
			else if (cell === ' ' || cell === '⠀') tone = 'space';
			else if (mask(cell) === undefined) tone = 'plain';
			else
				tone =
					reading.kind === 'indicator'
						? 'indicator'
						: 'cell';
			const label =
				tone === 'indicator'
					? indicatorLabel(reading.cells)
					: index === 0
						? reading.text
						: '';
			glyphs.push({ cell, label, tone });
		});
	}
	return glyphs;
}

const measure = (glyph: Glyph) => (glyph.tone === 'newline' ? 0 : cellWidth);

const kind = (glyph: Glyph): GlyphKind =>
	glyph.tone === 'space'
		? 'space'
		: glyph.tone === 'newline'
			? 'newline'
			: 'glyph';

const equals = (a: Glyph, b: Glyph) =>
	a.cell === b.cell && a.label === b.label && a.tone === b.tone;

const isCell = (glyph: Glyph) =>
	glyph.tone === 'cell' || glyph.tone === 'indicator';

const isPlain = (glyph: Glyph) => glyph.tone === 'plain';

const isMark = (glyph: Glyph) =>
	glyph.tone !== 'space' && glyph.tone !== 'newline';

function dotsOf(glyph: Glyph, rows: number) {
	const bits = mask(glyph.cell) ?? 0;
	return Array.from({ length: rows === 4 ? 8 : 6 }, (_, bit) => {
		const [column, row] = position(bit);
		return {
			x: dot.radius + column * dot.pitch,
			y: dot.radius + row * dot.pitch,
			raised: (bits & (1 << bit)) !== 0,
		};
	});
}

export default class Embossing extends Component<EmbossingSignature> {
	get glyphs() {
		return glyphsOf(this.args.readings);
	}

	get rows() {
		return this.glyphs.some((g) => (mask(g.cell) ?? 0) > 0x3f)
			? 4
			: 3;
	}

	get metrics() {
		return {
			height: cellHeight(this.rows) + labelRoom,
			rowGap: 10,
			gap: dot.gap,
		};
	}

	get cellHeight() {
		return cellHeight(this.rows);
	}

	get tall() {
		return this.rows === 4;
	}

	<template>
		<CanonGlyphFlow
			class="brl-embossing
				{{if this.tall 'brl-embossing--tall'}}"
			@glyphs={{this.glyphs}}
			@metrics={{this.metrics}}
			@measure={{measure}}
			@kind={{kind}}
			@equals={{equals}}
			@label={{@label}}
		>
			<:default as |glyph|>
				{{#if (isMark glyph)}}
					<span
						class="brl-glyph brl-glyph--{{glyph.tone}}"
					>
						{{#if (isCell glyph)}}
							<svg
								class="brl-cell"
								width={{cellWidth}}
								height={{this.cellHeight}}
							>
								{{#each
									(dotsOf
										glyph
										this.rows
									)
									as |d|
								}}
									{{#if
										d.raised
									}}
										<circle
											class="brl-dot"
											cx={{d.x}}
											cy={{d.y}}
											r={{dot.radius}}
										/>
									{{else}}
										<circle
											class="brl-pit"
											cx={{d.x}}
											cy={{d.y}}
											r="1.1"
										/>
									{{/if}}
								{{/each}}
							</svg>
						{{else if (isPlain glyph)}}
							<span
								class="brl-plain"
							>{{glyph.cell}}</span>
						{{/if}}
						{{#if glyph.label}}
							<span
								class="brl-label"
							>{{glyph.label}}</span>
						{{/if}}
					</span>
				{{/if}}
			</:default>
			<:empty>
				<span class="brl-blank"></span>
			</:empty>
		</CanonGlyphFlow>
	</template>
}
