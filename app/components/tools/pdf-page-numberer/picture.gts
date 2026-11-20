import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { ANCHORS, type Anchor } from 'delphitools-v2/lib/pdf-stamp';
import { AnchorZones } from 'delphitools-v2/components/tools/media/anchors';
import {
	minFontSize,
	watermarkSize,
	type FontFamily,
	type StampOptions,
} from 'delphitools-v2/components/tools/pdf-page-numberer/stamp';

export interface Size {
	width: number;
	height: number;
}

export interface PictureSignature {
	Args: {
		size?: Size;
		picture?: string;
		number: string | null;
		stamp: string | null;
		options: StampOptions;
		zones: boolean;
		onAnchor: (index: number) => void;
	};
}

const A4 = { width: 595.28, height: 841.89 };

const FONT_CSS: Record<FontFamily, string> = {
	sans: 'Helvetica, Arial, sans-serif',
	serif: '"Times New Roman", Times, serif',
	mono: '"Courier New", Courier, monospace',
};

const share = (points: number, page: Size) =>
	`${(points / page.width) * 100}cqi`;

function placed(o: StampOptions, anchor: Anchor, page: Size) {
	const margin = share(o.margin, page);
	const [v, h] = anchor.split('-');
	const parts = [
		`font-family: ${FONT_CSS[o.font]}`,
		`font-size: ${share(Math.max(minFontSize, o.fontSize), page)}`,
	];
	let x = '0';
	let y = '0';
	if (h === 'left') parts.push(`left: ${margin}`);
	else if (h === 'right') parts.push(`right: ${margin}`);
	else {
		parts.push('left: 50%');
		x = '-50%';
	}
	if (v === 'top') parts.push(`top: ${margin}`);
	else if (v === 'bottom') parts.push(`bottom: ${margin}`);
	else {
		parts.push('top: 50%');
		y = '-50%';
	}
	parts.push(`translate: ${x} ${y}`);
	return htmlSafe(parts.join('; '));
}

function watermark(o: StampOptions, text: string, page: Size) {
	const size = watermarkSize(page.width, page.height, text, o.font);
	return htmlSafe(
		[
			`font-family: ${FONT_CSS[o.font]}`,
			`font-size: ${share(size, page)}`,
			`opacity: ${o.opacity}`,
			'left: 50%',
			'top: 50%',
			'transform: translate(-50%, -50%) rotate(-45deg) translateY(-0.17em)',
		].join('; '),
	);
}

export default class Picture extends Component<PictureSignature> {
	get page() {
		return this.args.size ?? A4;
	}

	get boxStyle() {
		const { width, height } = this.page;
		return htmlSafe(`--ppn-aspect: ${width} / ${height}`);
	}

	get numberStyle() {
		return placed(
			this.args.options,
			this.args.options.numberAnchor,
			this.page,
		);
	}

	get stampStyle() {
		const { options, stamp } = this.args;
		return options.stampMode === 'watermark'
			? watermark(options, stamp ?? '', this.page)
			: placed(options, options.stampAnchor, this.page);
	}

	get anchorIndex() {
		return ANCHORS.indexOf(this.args.options.numberAnchor);
	}

	<template>
		<div class="ppn-picture">
			<div class="ppn-area">
				<div
					class="ppn-page
						{{unless
							@size
							'ppn-page--blank'
						}}"
					style={{this.boxStyle}}
				>
					{{#if @size}}
						<figure
							class="ppn-paper"
							aria-label="Preview"
						>
							{{#if @picture}}
								<img
									class="ppn-render"
									src={{@picture}}
									alt=""
									draggable="false"
								/>
							{{/if}}
							{{#if @number}}
								<span
									class="ppn-mark ppn-mark--number"
									style={{this.numberStyle}}
								>{{@number}}</span>
							{{/if}}
							{{#if @stamp}}
								<span
									class="ppn-mark ppn-mark--stamp
										{{if
											(eqMode
												@options.stampMode
											)
											'ppn-mark--watermark'
										}}"
									style={{this.stampStyle}}
								>{{@stamp}}</span>
							{{/if}}
						</figure>
						{{#if @zones}}
							<AnchorZones
								class="ppn-zones"
								@current={{this.anchorIndex}}
								@onPick={{@onAnchor}}
							/>
						{{/if}}
					{{/if}}
				</div>
			</div>
		</div>
	</template>
}

function eqMode(mode: string) {
	return mode === 'watermark';
}
