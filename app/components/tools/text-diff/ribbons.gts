import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { guidFor } from '@ember/object/internals';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import type {
	Block,
	DiffLine,
} from 'delphitools-v2/components/tools/text-diff/diff';
import { ribbonBlocks } from 'delphitools-v2/components/tools/text-diff/diff';

interface RibbonsSignature {
	Args: { diff: DiffLine[] };
}

const padding = 12;
const figureRow = 40;
const captionRoom = 6 + 14;
const fullLine = 72;

export function mapHeight(diff: DiffLine[]) {
	let old = 0;
	let next = 0;
	for (const line of diff) {
		if (line.type !== 'add') old++;
		if (line.type !== 'del') next++;
	}
	return Math.min(220, Math.max(72, Math.max(old, next, 1) * 7));
}

export function ribbonsHeight(diff: DiffLine[]) {
	return (
		padding +
		figureRow +
		8 +
		mapHeight(diff) +
		captionRoom +
		padding
	);
}

const measure = modifier(
	(element: HTMLElement, [report]: [(width: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(element.clientWidth),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

function ribbon(
	left: number,
	right: number,
	top: [number, number],
	bottom: [number, number],
) {
	const middle = (left + right) / 2;
	const b0 = Math.max(bottom[0], top[0] + 1);
	const b1 = Math.max(bottom[1], top[1] + 1);
	return (
		`M${left} ${top[0]}C${middle} ${top[0]} ${middle} ${top[1]} ${right} ${top[1]}` +
		`L${right} ${b1}C${middle} ${b1} ${middle} ${b0} ${left} ${b0}Z`
	);
}

const box = (x: number, y: number, w: number, h: number) =>
	`M${x} ${y}h${w}v${h}h${-w}Z`;

export default class Ribbons extends Component<RibbonsSignature> {
	@tracked width = 0;

	id = guidFor(this);

	setWidth = (width: number) => {
		if (width !== this.width) this.width = width;
	};

	get map() {
		return ribbonBlocks(this.args.diff);
	}

	get blank() {
		return this.args.diff.length === 0;
	}

	get removed() {
		return this.args.diff.filter((line) => line.type === 'del')
			.length;
	}

	get added() {
		return this.args.diff.filter((line) => line.type === 'add')
			.length;
	}

	get removedText() {
		return this.removed ? `−${this.removed}` : '0';
	}

	get addedText() {
		return this.added ? `+${this.added}` : '0';
	}

	get removedColour() {
		return this.removed
			? 'var(--canon-destructive)'
			: 'var(--canon-muted-foreground)';
	}

	get addedColour() {
		return this.added
			? 'var(--canon-math-green)'
			: 'var(--canon-muted-foreground)';
	}

	get spoken() {
		return this.blank
			? ''
			: `Removed ${this.removed}, Added ${this.added}`;
	}

	get height() {
		return mapHeight(this.args.diff);
	}

	get column() {
		return Math.round(this.width * 0.34);
	}

	get rightX() {
		return this.width - this.column;
	}

	get oldCount() {
		return this.map.oldLengths.length;
	}

	get newCount() {
		return this.map.newLengths.length;
	}

	get paths() {
		const { blocks, oldLengths, newLengths } = this.map;
		const { column, rightX, height } = this;
		const rows = Math.max(oldLengths.length, newLengths.length, 1);
		const pitch = height / rows;
		const y = (line: number) => line * pitch;
		const inner = { left: column + 6, right: rightX - 6 };
		const ribbons: { d: string; fill: string; kind: string }[] = [];

		blocks.forEach((block, index) => {
			const next: Block | undefined = blocks[index + 1];
			if (
				block.kind === 'add' &&
				blocks[index - 1]?.kind === 'del'
			)
				return;
			const top: [number, number] = [
				y(block.left[0]),
				y(block.right[0]),
			];
			const bottom: [number, number] = [
				y(block.left[1]),
				y(block.right[1]),
			];
			let fill: string;
			let kind: string = block.kind;
			if (block.kind === 'same') fill = '';
			else if (block.kind === 'del' && next?.kind === 'add') {
				bottom[1] = y(next.right[1]);
				fill = `url(#${this.id}-swap)`;
			} else fill = `url(#${this.id}-${block.kind})`;
			if (block.kind === 'del' && next?.kind === 'add')
				kind = 'swap';
			ribbons.push({
				d: ribbon(
					inner.left,
					inner.right,
					[top[0] + 0.75, top[1] + 0.75],
					[bottom[0] - 0.75, bottom[1] - 0.75],
				),
				fill,
				kind,
			});
		});

		const bar = Math.max(1, Math.min(pitch * 0.7, 5));
		const bars = { same: '', del: '', add: '' };
		for (const block of blocks)
			for (const [x0, lines, lengths, leading] of [
				[0, block.left, oldLengths, true],
				[rightX, block.right, newLengths, false],
			] as const) {
				if (lines[0] === lines[1]) continue;
				if (pitch < 2) {
					bars[block.kind] += box(
						x0,
						y(lines[0]),
						column,
						Math.max(
							1,
							(lines[1] - lines[0]) *
								pitch,
						),
					);
					continue;
				}
				for (
					let line = lines[0];
					line < lines[1];
					line++
				) {
					const length = lengths[line]!;
					if (!length) continue;
					const width = Math.max(
						3,
						column *
							Math.min(
								1,
								length /
									fullLine,
							),
					);
					const x = leading ? column - width : x0;
					bars[block.kind] += box(
						x,
						y(line) + (pitch - bar) / 2,
						width,
						bar,
					);
				}
			}

		return { ribbons, bars };
	}

	<template>
		<figure class="td-ribbons" aria-label="Differences">
			<div class="td-ribbons-box" {{measure this.setWidth}}>
				<div
					class="td-ribbons-figures
						{{if
							this.blank
							'td-ribbons-figures--blank'
						}}"
					aria-hidden="true"
				>
					<span class="td-ribbons-figure">
						<CanonFigure
							@text={{this.removedText}}
							@size={{26}}
							@colour={{this.removedColour}}
						/>
						<span
							class="td-ribbons-word"
						>Removed</span>
					</span>
					<span class="td-ribbons-figure">
						<span
							class="td-ribbons-word"
						>Added</span>
						<CanonFigure
							@text={{this.addedText}}
							@size={{26}}
							@colour={{this.addedColour}}
						/>
					</span>
				</div>
				<output
					class="dt-sr-only"
				>{{this.spoken}}</output>
				{{#if this.width}}
					<svg
						class="td-ribbons-map"
						width={{this.width}}
						height={{this.height}}
						aria-hidden="true"
					>
						{{#if this.blank}}
							<rect
								class="td-ribbons-blank"
								x="0.5"
								y="0.5"
								width={{minus
									this.column
									1
								}}
								height={{minus
									this.height
									1
								}}
							/>
							<rect
								class="td-ribbons-blank"
								x={{plus
									this.rightX
									0.5
								}}
								y="0.5"
								width={{minus
									this.column
									1
								}}
								height={{minus
									this.height
									1
								}}
							/>
						{{else}}
							<defs>
								<linearGradient
									id="{{this.id}}-swap"
									gradientUnits="userSpaceOnUse"
									x1={{this.column}}
									x2={{this.rightX}}
								>
									<stop
										class="td-stop-del"
										offset="0"
									/>
									<stop
										class="td-stop-add"
										offset="1"
									/>
								</linearGradient>
								<linearGradient
									id="{{this.id}}-del"
									gradientUnits="userSpaceOnUse"
									x1={{this.column}}
									x2={{this.rightX}}
								>
									<stop
										class="td-stop-del"
										offset="0"
									/>
									<stop
										class="td-stop-del td-stop--faint"
										offset="1"
									/>
								</linearGradient>
								<linearGradient
									id="{{this.id}}-add"
									gradientUnits="userSpaceOnUse"
									x1={{this.column}}
									x2={{this.rightX}}
								>
									<stop
										class="td-stop-add td-stop--faint"
										offset="0"
									/>
									<stop
										class="td-stop-add"
										offset="1"
									/>
								</linearGradient>
							</defs>
							{{#each
								this.paths.ribbons
								as |band|
							}}
								<path
									class="td-ribbon td-ribbon--{{band.kind}}"
									fill={{if
										band.fill
										band.fill
									}}
									d={{band.d}}
								/>
							{{/each}}
							<path
								class="td-bars td-bars--same"
								d={{this.paths.bars.same}}
							/>
							<path
								class="td-bars td-bars--del"
								d={{this.paths.bars.del}}
							/>
							<path
								class="td-bars td-bars--add"
								d={{this.paths.bars.add}}
							/>
						{{/if}}
					</svg>
				{{/if}}
				<div
					class="td-ribbons-captions"
					aria-hidden="true"
				>
					<span>Original{{#unless
							this.blank
						}}<span
								class="td-ribbons-count"
							>{{this.oldCount}}</span>{{/unless}}</span>
					<span>Modified{{#unless
							this.blank
						}}<span
								class="td-ribbons-count"
							>{{this.newCount}}</span>{{/unless}}</span>
				</div>
			</div>
		</figure>
	</template>
}

function minus(a: number, b: number) {
	return Math.max(0, a - b);
}

function plus(a: number, b: number) {
	return a + b;
}
