import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonImageCompare from 'delphicanon/components/canon-image-compare';
import CanonSegmented from 'delphicanon/components/canon-segmented';

function landscape(filter: string) {
	const hills = Array.from({ length: 5 }, (_, i) => {
		const y = 90 + i * 14;
		return `<path d="M0 ${y} Q 80 ${y - 40} 160 ${y} T 320 ${y} V 180 H 0 Z" fill="hsl(${150 + i * 40} 55% ${55 - i * 7}%)"/>`;
	}).join('');
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><defs><filter id="f">${filter}</filter><linearGradient id="s" x2="0" y2="1"><stop offset="0" stop-color="#f6c628"/><stop offset="1" stop-color="#e8f3e6"/></linearGradient></defs><g filter="url(#f)"><rect width="320" height="180" fill="url(#s)"/><circle cx="236" cy="56" r="26" fill="#cc272e"/>${hills}</g></svg>`;
	return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const looks = [
	{ name: 'Grey', filter: '<feColorMatrix type="saturate" values="0"/>' },
	{
		name: 'Night',
		filter: '<feColorMatrix type="hueRotate" values="180"/><feComponentTransfer><feFuncR type="linear" slope="0.5"/><feFuncG type="linear" slope="0.6"/></feComponentTransfer>',
	},
	{
		name: 'Shift',
		filter: '<feColorMatrix type="hueRotate" values="120"/>',
	},
];
const wide = 16 / 9;
const names = looks.map((look) => look.name);
const before = landscape('<feOffset/>');
const afters = looks.map((look) => landscape(look.filter));

export default class ComparePattern extends Component {
	@tracked look = 0;

	get after() {
		return afters[this.look];
	}

	get afterTitle() {
		return names[this.look];
	}

	pick = (index: number) => (this.look = index);

	<template>
		<CanonCanvas @aspect={{wide}} @background="var(--canon-muted)">
			<CanonImageCompare
				@before={{before}}
				@after={{this.after}}
				@beforeTitle="Original"
				@afterTitle={{this.afterTitle}}
			/>
		</CanonCanvas>
		<CanonSegmented
			aria-label="Look"
			@items={{names}}
			@selected={{this.look}}
			@onChange={{this.pick}}
		/>
	</template>
}
