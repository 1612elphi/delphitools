import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import {
	NANOID_ALPHABET,
	uuid7Timestamp,
	type IdentifierKind,
} from 'delphitools-v2/lib/uuid';
import {
	bitCounts,
	columns,
	fieldNames,
	stamp,
} from 'delphitools-v2/components/tools/uuid-genny/anatomy';

const settle = { first: 180, step: 14 };
const frameMs = 33;

const hex = '0123456789abcdef';
const pick = (alphabet: string) =>
	alphabet.charAt(Math.floor(Math.random() * alphabet.length));

interface PictureSignature {
	Args: {
		text: string;
		raw: string;
		kind: IdentifierKind;
		label: string;
		scrambleKey: number;
	};
}

export default class UuidPicture extends Component<PictureSignature> {
	@tracked frame = 0;
	#settle: number[] = [];
	#key?: number;

	get columns() {
		return columns(this.args.text, this.args.kind);
	}

	get style() {
		return htmlSafe(
			`--uuid-columns: ${Math.max(this.columns.length, 1)}; --uuid-rows: ${this.args.kind === 'nanoid' ? 6 : 4}`,
		);
	}

	get shown() {
		void this.frame;
		const now = performance.now();
		const alphabet =
			this.args.kind === 'nanoid' ? NANOID_ALPHABET : hex;
		return this.columns.map((column, index) => {
			if (!column)
				return {
					character: '-',
					tone: 'muted',
					bits: [],
				};
			const scrambling = now < (this.#settle[index] ?? 0);
			const fixed = column.fields.some(
				(field) =>
					field === 'version' ||
					field === 'variant',
			);
			return {
				character: scrambling
					? pick(alphabet)
					: column.character,
				tone: scrambling
					? 'muted'
					: fixed
						? 'fixed'
						: 'plain',
				bits: column.bits.map((bit, row) => ({
					on: scrambling
						? Math.random() < 0.5
						: bit,
					field: column.fields[row],
				})),
			};
		});
	}

	get bracket() {
		if (this.args.kind !== 'uuid7') return undefined;
		const last = this.columns.findLastIndex(
			(column) => column?.fields[0] === 'time',
		);
		const ms = uuid7Timestamp(this.args.raw);
		if (last < 0 || !Number.isFinite(ms)) return undefined;
		return {
			stamp: stamp(ms),
			style: htmlSafe(`grid-column: 1 / span ${last + 1}`),
		};
	}

	get legend() {
		return bitCounts(this.args.kind).map(([field, bits]) => ({
			field,
			name: fieldNames[field],
			bits,
		}));
	}

	scramble = modifier((_element: Element, [key]: [number]) => {
		const first = this.#key === undefined;
		if (key === this.#key) return;
		this.#key = key;
		if (first) return;
		if (
			window.matchMedia('(prefers-reduced-motion: reduce)')
				.matches
		)
			return;
		const start = performance.now();
		this.#settle = this.columns.map(
			(_, i) => start + settle.first + i * settle.step,
		);
		const end = this.#settle.at(-1) ?? start;
		let raf = 0;
		let drawn = 0;
		const tick = (now: number) => {
			if (now - drawn >= frameMs || now > end) {
				drawn = now;
				this.frame += 1;
			}
			if (now <= end) raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => {
			cancelAnimationFrame(raf);
			this.#settle = [];
		};
	});

	<template>
		<div
			class="uuid-picture"
			role="img"
			aria-label="{{@label}} {{@text}}"
			style={{this.style}}
			{{this.scramble @scrambleKey}}
		>
			<div class="uuid-picture-grid" aria-hidden="true">
				{{#each this.shown as |column|}}
					<span class="uuid-picture-column">
						<span
							class="uuid-picture-character uuid-picture--{{column.tone}}"
						>{{column.character}}</span>
						<span class="uuid-picture-bits">
							{{#each
								column.bits
								as |bit|
							}}
								<span
									class="uuid-picture-bit uuid-picture-bit--{{bit.field}}
										{{if
											bit.on
											'uuid-picture-bit--on'
										}}"
								></span>
							{{/each}}
						</span>
					</span>
				{{/each}}
				{{#if this.bracket}}
					<span
						class="uuid-picture-bracket"
						style={{this.bracket.style}}
					>
						<span
							class="uuid-picture-bracket-line"
						></span>
						<span
							class="uuid-picture-stamp"
						>{{this.bracket.stamp}}</span>
					</span>
				{{/if}}
			</div>
			<div class="uuid-picture-legend" aria-hidden="true">
				{{#each this.legend as |item|}}
					<span class="uuid-picture-legend-item">
						<span
							class="uuid-picture-key uuid-picture-bit--{{item.field}}"
						></span>
						<span>{{item.name}}</span>
						<span
							class="uuid-picture-legend-bits"
						>{{item.bits}}
							bits</span>
					</span>
				{{/each}}
			</div>
		</div>
	</template>
}
