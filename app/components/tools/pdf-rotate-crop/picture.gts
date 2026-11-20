import Component from '@glimmer/component';
import CanonLoader from 'delphicanon/components/canon-loader';
import CropRect, { box } from 'delphitools-v2/components/tools/media/crop-rect';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import type { Rect, Size } from 'delphitools-v2/lib/crop-rect';

export interface PictureSignature {
	Args: {
		url?: string;
		size?: Size;
		crop: Rect;
		onCrop: (crop: Rect) => void;
		onSettle: () => void;
	};
}

const A4 = { width: 595.28, height: 841.89 };

const mm = (points: number) => Math.round(points / MM_TO_POINTS);

export default class Picture extends Component<PictureSignature> {
	get size() {
		return this.args.size ?? A4;
	}

	get valueText() {
		const { x, y, width, height } = this.args.crop;
		return `${mm(width)} × ${mm(height)} mm, ${mm(x)}, ${mm(y)}`;
	}

	<template>
		<CropRect
			class="prc-picture"
			@url={{@url}}
			@alt="Page preview"
			@size={{this.size}}
			@crop={{@crop}}
			@valueText={{this.valueText}}
			@onCrop={{@onCrop}}
			@onSettle={{@onSettle}}
			as |frame|
		>
			{{#unless @url}}
				<span
					class="prc-blank"
					style={{box frame}}
				></span>
				{{#if @size}}
					<span class="prc-loader"><CanonLoader
						/></span>
				{{/if}}
			{{/unless}}
		</CropRect>
	</template>
}
