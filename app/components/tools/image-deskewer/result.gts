import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { registerDestructor } from '@ember/destroyable';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonDimensionLine from 'delphicanon/components/canon-dimension-line';
import CanonLoader from 'delphicanon/components/canon-loader';
import { dimensionLines, sheet } from 'delphicanon/lib/dimension-line';
import type { Size } from 'delphitools-v2/lib/deskew';
import {
	divisions,
	type Rect,
} from 'delphitools-v2/components/tools/image-deskewer/geometry';

export interface ResultSignature {
	Args: {
		canvas: HTMLCanvasElement;
		size: Size;
		valid: boolean;
		drawn: boolean;
		stamp: number;
		springs: boolean;
	};
}

const padding = 16;

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

const box = ({ x, y, width, height }: Rect) =>
	htmlSafe(
		`inset-inline-start: ${px(x)}; inset-block-start: ${px(y)}; inline-size: ${px(width)}; block-size: ${px(height)}`,
	);

const shares = Array.from(
	{ length: divisions - 1 },
	(_, i) => `${((i + 1) / divisions) * 100}%`,
);

const isOdd = (index: number) => index % 2 === 1;

export default class Result extends Component<ResultSignature> {
	@tracked area: Rect = { x: 0, y: 0, width: 0, height: 0 };
	@tracked guides = false;
	#timer?: number;

	constructor(owner: Owner, args: ResultSignature['Args']) {
		super(owner, args);
		registerDestructor(this, () =>
			window.clearTimeout(this.#timer),
		);
	}

	get frame() {
		return sheet(this.args.size, this.area);
	}

	get sheetStyle() {
		return box(this.frame);
	}

	get lines() {
		const { across, down } = dimensionLines(this.frame);
		return { across: box(across), down: box(down) };
	}

	get guideStyles() {
		return shares.flatMap((share) => [
			htmlSafe(`inset-inline-start: ${share}`),
			htmlSafe(`inset-block-start: ${share}`),
		]);
	}

	get label() {
		const { width, height } = this.args.size;
		return `Result ${width} × ${height}`;
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.area = {
				x: padding,
				y: padding / 2,
				width: element.clientWidth - padding * 2,
				height: element.clientHeight - padding * 1.5,
			};
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	show = modifier(
		(element: HTMLElement, [canvas]: [HTMLCanvasElement]) => {
			element.replaceChildren(canvas);
		},
	);

	flash = modifier((_: HTMLElement, [stamp]: [number]) => {
		void stamp;
		window.clearTimeout(this.#timer);
		queueMicrotask(() => {
			this.guides = true;
		});
		this.#timer = window.setTimeout(() => {
			this.guides = false;
		}, 1000);
	});

	<template>
		<div
			class="deskew-result
				{{if @springs 'deskew-result--springs'}}
				{{if this.guides 'deskew-result--guides'}}
				{{unless @valid 'deskew-result--crossed'}}"
			{{this.measure}}
			{{this.flash @stamp}}
		>
			<span
				class="deskew-result-name"
				role="img"
				aria-label={{this.label}}
			></span>
			{{#if this.area.width}}
				<div
					class="deskew-sheet"
					style={{this.sheetStyle}}
				>
					<div
						class="deskew-sheet-picture"
						{{this.show @canvas}}
					></div>
					{{#each
						this.guideStyles
						as |style index|
					}}
						<span
							class="deskew-guide
								{{if
									(isOdd
										index
									)
									'deskew-guide--across'
								}}"
							style={{style}}
						></span>
					{{/each}}
					{{#unless @drawn}}
						<CanonLoader
							class="deskew-result-loader"
						/>
					{{/unless}}
				</div>
				<CanonDimensionLine
					class="deskew-dimension"
					@pixels={{@size.width}}
					style={{this.lines.across}}
				/>
				<CanonDimensionLine
					class="deskew-dimension"
					@pixels={{@size.height}}
					@down={{true}}
					style={{this.lines.down}}
				/>
			{{/if}}
		</div>
	</template>
}
