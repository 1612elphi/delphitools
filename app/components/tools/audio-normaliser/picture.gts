import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import type { WaveformPeaks } from 'delphitools-v2/lib/audio';
import { dbToGain } from 'delphitools-v2/lib/normalise';

export interface PictureSignature {
	Args: {
		peaks: WaveformPeaks | null;
		gainDb: number | null;
		limited: boolean;
		blank?: boolean;
	};
}

const ceiling = dbToGain(-1);

export const gainText = (gainDb: number) =>
	`${gainDb >= 0 ? '+' : '−'}${Math.abs(gainDb).toFixed(1)}`;

function paint(
	canvas: HTMLCanvasElement,
	peaks: WaveformPeaks | null,
	gainDb: number | null,
	limited: boolean,
) {
	const ratio = window.devicePixelRatio || 1;
	const width = Math.round(canvas.clientWidth * ratio);
	const height = Math.round(canvas.clientHeight * ratio);
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context || !width || !height) return;
	const style = getComputedStyle(canvas);
	const colour = (name: string) => style.getPropertyValue(name).trim();
	const muted = colour('--canon-muted-foreground');
	const mid = height / 2;
	const half = height / 2;

	context.fillStyle = colour('--canon-border');
	context.fillRect(0, mid, width, ratio);

	context.strokeStyle = limited ? colour('--canon-destructive') : muted;
	context.globalAlpha = 0.7;
	context.lineWidth = ratio;
	context.setLineDash([4 * ratio, 4 * ratio]);
	for (const side of [-1, 1]) {
		const y = mid + side * half * ceiling;
		context.beginPath();
		context.moveTo(0, y);
		context.lineTo(width, y);
		context.stroke();
	}
	context.setLineDash([]);
	context.globalAlpha = 1;

	if (!peaks || peaks.min.length === 0) return;
	const gain = dbToGain(gainDb ?? 0);
	const buckets = peaks.min.length;
	const merge = Math.max(1, Math.ceil(buckets / canvas.clientWidth));
	const columns = Math.ceil(buckets / merge);
	const step = width / columns;
	const before = new Path2D();
	const after = new Path2D();
	for (let column = 0; column < columns; column++) {
		let high = -Infinity;
		let low = Infinity;
		for (
			let b = column * merge;
			b < Math.min(buckets, (column + 1) * merge);
			b++
		) {
			high = Math.max(high, peaks.max[b]!);
			low = Math.min(low, peaks.min[b]!);
		}
		const x = column * step;
		const w = Math.max(1, step);
		before.rect(
			x,
			mid - high * half,
			w,
			Math.max(1, (high - low) * half),
		);
		const top = Math.min(1, high * gain);
		const bottom = Math.max(-1, low * gain);
		after.rect(
			x,
			mid - top * half,
			w,
			Math.max(1, (top - bottom) * half),
		);
	}
	const source: [Path2D, string, number] = [before, muted, 0.55];
	const result: [Path2D, string, number] = [
		after,
		colour('--canon-primary'),
		1,
	];
	for (const [path, fill, alpha] of gain >= 1
		? [result, source]
		: [source, result]) {
		context.globalAlpha = alpha;
		context.fillStyle = fill;
		context.fill(path);
	}
	context.globalAlpha = 1;
}

export default class Picture extends Component<PictureSignature> {
	get figure() {
		const { gainDb, blank } = this.args;
		if (blank) return '-.-';
		return gainDb === null ? '' : gainText(gainDb);
	}

	get colour() {
		if (this.args.blank) return 'var(--canon-muted-foreground)';
		return this.args.limited
			? 'var(--canon-destructive)'
			: 'var(--canon-primary)';
	}

	draw = modifier(
		(
			canvas: HTMLCanvasElement,
			[peaks, gainDb, limited]: [
				WaveformPeaks | null,
				number | null,
				boolean,
			],
		) => {
			const render = () =>
				paint(canvas, peaks, gainDb, limited);
			render();
			const size = new ResizeObserver(render);
			size.observe(canvas);
			const theme = new MutationObserver(render);
			theme.observe(document.documentElement, {
				attributeFilter: ['class'],
			});
			return () => {
				size.disconnect();
				theme.disconnect();
			};
		},
	);

	<template>
		<div class="an-picture">
			<canvas
				class="an-wave"
				aria-hidden="true"
				{{this.draw @peaks @gainDb @limited}}
			></canvas>
			{{#if this.figure}}
				<output class="an-figure" aria-label="Gain">
					<CanonFigure
						@text={{this.figure}}
						@unit="dB"
						@colour={{this.colour}}
						@halo="var(--canon-muted)"
					/>
				</output>
			{{/if}}
		</div>
	</template>
}
