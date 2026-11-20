import type { TOC } from '@ember/component/template-only';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import { IconSvg } from 'delphitools-v2/components/icon';
import './anchors.css';

const ANCHOR_NAMES = [
	'Top left',
	'Top centre',
	'Top right',
	'Middle left',
	'Centre',
	'Middle right',
	'Bottom left',
	'Bottom centre',
	'Bottom right',
];

const ANCHOR_ICONS = [
	<template><IconSvg @name="arrow-up-left" /></template>,
	<template><IconSvg @name="arrow-up" /></template>,
	<template><IconSvg @name="arrow-up-right" /></template>,
	<template><IconSvg @name="arrow-left" /></template>,
	<template><IconSvg @name="dot" /></template>,
	<template><IconSvg @name="arrow-right" /></template>,
	<template><IconSvg @name="arrow-down-left" /></template>,
	<template><IconSvg @name="arrow-down" /></template>,
	<template><IconSvg @name="arrow-down-right" /></template>,
];

export interface AnchorPickerSignature {
	Args: {
		selected: number;
		disabled?: boolean;
		onChange: (index: number) => void;
	};
	Element: HTMLDivElement;
}

export const AnchorPicker: TOC<AnchorPickerSignature> = <template>
	<CanonSegmented
		@items={{ANCHOR_NAMES}}
		@icons={{ANCHOR_ICONS}}
		@columns={{3}}
		@selected={{@selected}}
		@disabled={{@disabled}}
		@onChange={{@onChange}}
		...attributes
	/>
</template>;

export interface AnchorZonesSignature {
	Args: {
		current: number;
		onPick: (index: number) => void;
	};
	Element: HTMLDivElement;
}

const zoneClass = (index: number, current: number) =>
	`media-anchor-zone media-anchor-zone--row${Math.floor(index / 3)} media-anchor-zone--column${index % 3}${index === current ? ' media-anchor-zone--current' : ''}`;

export const AnchorZones: TOC<AnchorZonesSignature> = <template>
	<div class="media-anchor-zones" ...attributes>
		{{#each ANCHOR_NAMES as |name index|}}
			<button
				type="button"
				tabindex="-1"
				class={{zoneClass index @current}}
				aria-label={{name}}
				{{on "click" (fn @onPick index)}}
			><span class="media-anchor-mark"></span></button>
		{{/each}}
	</div>
</template>;
