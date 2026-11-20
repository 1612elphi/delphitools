import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import CanonGlyphFlow from 'delphicanon/components/canon-glyph-flow';
import {
	fitPitch,
	ghost,
	slotsPerGroup,
	type Group,
	type Reading,
} from 'delphitools-v2/components/tools/encoder/engine';

interface RegroupSignature {
	Args: { reading: Reading; label: string };
}

const labelRow = 17;
const bracket = 7;
const bitHeight = 16;
const bitsTop = labelRow + bracket;
const bitsBottom = bitsTop + bitHeight;
const groupGap = 12;
const metrics = {
	height: labelRow * 2 + bracket * 2 + bitHeight,
	rowGap: 12,
	gap: groupGap,
};
const padding = 16;

interface Glyph {
	group: Group;
	key: string;
	width: number;
}

const kind = () => 'glyph' as const;
const measure = (glyph: Glyph) => glyph.width;
const equals = (a: Glyph, b: Glyph) => a.key === b.key;

function keyOf(group: Group) {
	const units = (list: Group['top']) =>
		list
			.map((u) => `${u.label}:${u.span}:${u.faint ?? ''}`)
			.join('|');
	return `${group.slots.join('')}/${units(group.top)}/${units(group.bottom)}`;
}

const observe = modifier(
	(element: HTMLElement, [report]: [(width: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(element.clientWidth),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

function units(list: Group['top'], pitch: number, y: number, down: boolean) {
	let start = 0;
	return list.map((unit, index) => {
		const left = start * pitch;
		const right = left + unit.span * pitch - 1;
		start += unit.span;
		const tip = down ? y + 2.5 : y - 2.5;
		const isCode =
			unit.label.length > 1 &&
			/^[\x20-\x7e]+$/.test(unit.label);
		return {
			label: unit.label,
			x: (left + right) / 2,
			faint: unit.faint,
			ink: index % 2,
			code: isCode,
			bracket:
				unit.faint && !unit.label
					? undefined
					: `M${left + 0.5} ${tip}V${y}H${right - 0.5}V${tip}`,
		};
	});
}

function drawing(group: Group, pitch: number) {
	const owner = group.bottom.flatMap((unit, index) =>
		Array<number>(unit.span).fill(index),
	);
	const cell = Math.max(1, pitch - 1);
	return {
		width: group.slots.length * pitch - 1,
		bits: group.slots.map((slot, index) => {
			const x = index * pitch;
			const ink = (owner[index] ?? 0) % 2;
			if (slot === 'one')
				return {
					x,
					y: bitsTop,
					w: cell,
					h: bitHeight,
					ink,
					kind: 'one',
				};
			if (slot === 'zero')
				return {
					x,
					y: bitsBottom - 3,
					w: cell,
					h: 3,
					ink,
					kind: 'zero',
				};
			if (slot === 'pad')
				return {
					x: x + 0.5,
					y: bitsTop + 0.5,
					w: cell - 1,
					h: bitHeight - 1,
					ink,
					kind: 'pad',
				};
			return {
				x: x + cell / 2 - 0.5,
				y: bitsBottom - 1,
				w: 1,
				h: 1,
				ink,
				kind: 'absent',
			};
		}),
		top: units(group.top, pitch, bitsTop - 3, true),
		bottom: units(group.bottom, pitch, bitsBottom + 3, false),
		topY: labelRow / 2,
		bottomY: bitsBottom + bracket + labelRow / 2,
	};
}

const Strip: TOC<{
	Args: { d: ReturnType<typeof drawing> };
}> = <template>
	<svg
		class="enc-strip"
		width={{@d.width}}
		height={{metrics.height}}
		aria-hidden="true"
	>
		{{#each @d.bits as |b|}}
			<rect
				class="enc-bit enc-bit--{{b.kind}}
					enc-ink{{b.ink}}"
				x={{b.x}}
				y={{b.y}}
				width={{b.w}}
				height={{b.h}}
			/>
		{{/each}}
		{{#each @d.top as |u|}}
			{{#if u.bracket}}
				<path
					class="enc-bracket
						{{if u.faint 'enc-faint'}}"
					d={{u.bracket}}
				/>
			{{/if}}
			<text
				class="enc-label
					{{if u.code 'enc-label--code'}}
					{{if u.faint 'enc-faint'}}"
				x={{u.x}}
				y={{@d.topY}}
			>{{u.label}}</text>
		{{/each}}
		{{#each @d.bottom as |u|}}
			{{#if u.bracket}}
				<path
					class="enc-bracket enc-ink{{u.ink}}
						{{if u.faint 'enc-faint'}}"
					d={{u.bracket}}
				/>
			{{/if}}
			<text
				class="enc-label enc-ink{{u.ink}}
					{{if u.code 'enc-label--code'}}
					{{if u.faint 'enc-faint'}}"
				x={{u.x}}
				y={{@d.bottomY}}
			>{{u.label}}</text>
		{{/each}}
	</svg>
</template>;

export default class Regroup extends Component<RegroupSignature> {
	@tracked width = 0;

	get pitch() {
		return fitPitch(
			Math.max(0, this.width - padding * 2 - 1),
			groupGap,
		);
	}

	get perRow() {
		const area = this.width - padding * 2;
		const glyph = slotsPerGroup * this.pitch - 1;
		return Math.max(
			1,
			Math.floor((area + groupGap) / (glyph + groupGap)),
		);
	}

	get glyphs(): Glyph[] {
		const { reading } = this.args;
		const { perRow, pitch } = this;
		const rows = Math.ceil(reading.count / perRow);
		const firstRow = Math.max(0, Math.floor((rows - 4) / 4) * 4);
		return reading
			.groups(firstRow * perRow, reading.count)
			.map((group) => ({
				group,
				key: keyOf(group),
				width: group.slots.length * pitch - 1,
			}));
	}

	get ghost() {
		return drawing(ghost(), this.pitch);
	}

	draw = (glyph: Glyph) => drawing(glyph.group, this.pitch);

	measured = (width: number) => {
		if (width !== this.width) this.width = width;
	};

	<template>
		<div class="enc-regroup" {{observe this.measured}}>
			{{#if this.width}}
				<CanonGlyphFlow
					@glyphs={{this.glyphs}}
					@metrics={{metrics}}
					@measure={{measure}}
					@kind={{kind}}
					@equals={{equals}}
					@label={{@label}}
				>
					<:default as |glyph|>
						{{#let
							(this.draw glyph)
							as |d|
						}}
							<Strip @d={{d}} />
						{{/let}}
					</:default>
					<:empty>
						<span class="enc-regroup-ghost">
							<Strip
								@d={{this.ghost}}
							/>
						</span>
					</:empty>
				</CanonGlyphFlow>
			{{/if}}
		</div>
	</template>
}
