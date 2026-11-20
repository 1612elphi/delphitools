import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import { signed } from 'delphitools-v2/components/tools/font-explorer/sfnt';

export interface Shares {
	ascent: number;
	capHeight: number;
	xHeight: number;
	descent: number;
	unitsPerEm: number;
}

export const standIn: Shares = {
	ascent: 0.95,
	capHeight: 0.7,
	xHeight: 0.52,
	descent: 0.24,
	unitsPerEm: 1000,
};

interface PictureSignature {
	Args: {
		text: string;
		family: string;
		shares: Shares;
		values: boolean;
		caption: string;
		detail?: string;
		figure: string;
		figureUnit?: string;
	};
}

export const captionHeight = 44;
const padding = 16;
const labelRoom = 16;
const labelGap = 12;
const widthFloor = 0.5;

let context: CanvasRenderingContext2D | null | undefined;
function width(text: string, font: string): number {
	context ??= document.createElement('canvas').getContext('2d');
	if (!context) return text.length * 6;
	context.font = font;
	return context.measureText(text).width;
}

export function fit(
	shares: Shares,
	advance: number,
	area: { y: number; width: number; height: number },
): { em: number; baseline: number } {
	const depth = Math.max(shares.ascent + shares.descent, 0.01);
	const room = Math.max(0, area.height - labelRoom);
	const tall = room / depth;
	const wide = advance > 0 ? area.width / advance : tall;
	const em = Math.max(Math.min(tall, wide), tall * widthFloor);
	const top = area.y + labelRoom + (room - em * depth) / 2;
	return { em, baseline: top + shares.ascent * em };
}

export default class FontPicture extends Component<PictureSignature> {
	@tracked width = 0;
	@tracked height = 0;
	mono = 'monospace';
	ui = 'sans-serif';

	measure = modifier((element: HTMLElement) => {
		const style = getComputedStyle(element);
		this.mono =
			style.getPropertyValue('--canon-mono-font').trim() ||
			this.mono;
		this.ui =
			style.getPropertyValue('--canon-font').trim() ||
			this.ui;
		const observer = new ResizeObserver(([entry]) => {
			this.width = entry?.contentRect.width ?? 0;
			this.height = entry?.contentRect.height ?? 0;
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	get plan() {
		const { shares, values, text, family } = this.args;
		const top = captionHeight + 4;
		const area = {
			x: padding,
			y: top,
			width: this.width - padding * 2,
			height: this.height - padding - top,
		};
		if (area.width <= 0 || area.height <= 0) return undefined;
		const units = (share: number) =>
			signed(Math.round(share * shares.unitsPerEm));
		const named = [
			['Ascent', shares.ascent, 'plain'],
			['Cap Height', shares.capHeight, 'dashed'],
			['x-Height', shares.xHeight, 'dashed'],
			['Baseline', 0, 'baseline'],
			['Descent', -shares.descent, 'plain'],
		] as const;
		const nameFont = `600 11px ${this.ui}`;
		const valueFont = `600 11px ${this.mono}`;
		const labels = named.map(([name, share, rule]) => ({
			name,
			share,
			rule,
			value: values ? units(share) : undefined,
		}));
		const column = Math.ceil(
			Math.max(
				...labels.map(
					(l) =>
						width(l.name, nameFont) +
						(l.value
							? width(
									`  ${l.value}`,
									valueFont,
								)
							: 0),
				),
			),
		);
		const typeArea = {
			y: area.y,
			width: Math.max(0, area.width - column - labelGap),
			height: area.height,
		};
		const advance = width(text, `100px ${family}`) / 100;
		const { em, baseline } = fit(shares, advance, typeArea);
		let ceiling = Infinity;
		const placed = labels
			.map((label) => ({
				...label,
				y: baseline - label.share * em,
			}))
			.sort((a, b) => b.y - a.y)
			.map((label) => {
				const textY = label.y - 3;
				const shows =
					textY <= ceiling &&
					textY - 11 >= captionHeight;
				if (shows) ceiling = textY - 13;
				return { ...label, textY, shows };
			});
		const xLine = baseline - shares.xHeight * em;
		return {
			em,
			baseline,
			typeX: area.x,
			labelX: this.width - padding,
			tintY: xLine,
			tintHeight: Math.max(0, baseline - xLine),
			lines: placed,
			fontSize: em,
		};
	}

	<template>
		<div class="fx-picture" {{this.measure}}>
			<div class="fx-picture-caption">
				<span class="fx-picture-names">
					<span
						class="fx-picture-title"
					>{{@caption}}</span>
					{{#if @detail}}
						<span
							class="fx-picture-detail"
						>{{@detail}}</span>
					{{/if}}
				</span>
				<CanonFigure
					@text={{@figure}}
					@unit={{@figureUnit}}
					@size={{28}}
					@halo="var(--canon-card)"
				/>
			</div>
			{{#if this.plan}}
				<svg
					class="fx-picture-svg
						{{if
							@values
							'fx-picture-svg--values'
						}}"
					role="img"
					aria-label={{@text}}
				>
					<rect
						class="fx-picture-tint"
						x="0"
						y={{this.plan.tintY}}
						width="100%"
						height={{this.plan.tintHeight}}
					/>
					{{#each
						this.plan.lines key="name"
						as |metric|
					}}
						<line
							class="fx-rule fx-rule--{{metric.rule}}"
							x1="0"
							x2="100%"
							y1={{metric.y}}
							y2={{metric.y}}
						/>
					{{/each}}
					<text
						class="fx-picture-type"
						x={{this.plan.typeX}}
						y={{this.plan.baseline}}
						font-family={{@family}}
						font-size={{this.plan.fontSize}}
					>{{@text}}</text>
					{{#each
						this.plan.lines key="name"
						as |line|
					}}
						{{#if line.shows}}
							<text
								class="fx-label"
								x={{this.plan.labelX}}
								y={{line.textY}}
							><tspan
									class="fx-label-name"
								>{{line.name}}</tspan>{{#if
									line.value
								}}<tspan
										class="fx-label-value"
										dx="6"
									>{{line.value}}</tspan>{{/if}}</text>
						{{/if}}
					{{/each}}
				</svg>
			{{/if}}
		</div>
	</template>
}
