import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { IconSvg } from 'delphitools-v2/components/icon';
import type { GpsFix } from 'delphitools-v2/lib/metadata';
import {
	loadLand,
	locationLabel,
	mapHeight as height,
	mapPoint,
	north,
} from 'delphitools-v2/lib/world-map';
import {
	blockNames,
	lamps,
	type Block,
} from 'delphitools-v2/components/tools/metadata-stripper/blocks';

export interface DossierSignature {
	Args: {
		found: Set<Block> | null;
		left: Set<Block> | null;
		location: GpsFix | null;
	};
}

const meridians = [-150, -120, -90, -60, -30, 0, 30, 60, 90, 120, 150].map(
	(lon) => lon + 180,
);
const parallels = [-30, 0, 30, 60].map((lat) => north - lat);

export default class Dossier extends Component<DossierSignature> {
	@tracked land = '';

	viewBox = `0 0 360 ${height}`;
	meridians = meridians;
	parallels = parallels;
	height = height;

	constructor(owner: Owner, args: DossierSignature['Args']) {
		super(owner, args);
		void loadLand().then((path) => {
			if (!this.isDestroying) this.land = path;
		});
	}

	get point() {
		const { location } = this.args;
		return location ? mapPoint(location.lat, location.lon) : null;
	}

	get removed() {
		const { left } = this.args;
		return !!this.args.location && !!left && !left.has('GPS');
	}

	get caption() {
		const { location } = this.args;
		return location ? locationLabel(location) : 'No location';
	}

	get pinStyle() {
		const { point } = this;
		if (!point) return undefined;
		return htmlSafe(
			`inset-inline-start: ${(point.x / 360) * 100}%; inset-block-start: ${(point.y / height) * 100}%`,
		);
	}

	get captionClass() {
		const { point } = this;
		if (!point) return 'ms-caption--centre';
		return [
			point.x < 180 ? 'ms-caption--end' : 'ms-caption--start',
			point.y > height / 2
				? 'ms-caption--top'
				: 'ms-caption--bottom',
		].join(' ');
	}

	get lamps() {
		const states = lamps(
			this.args.found ?? new Set(),
			this.args.left,
		);
		return blockNames.map((name, index) => ({
			name,
			state: states[index]!,
			style: htmlSafe(`--ms-turn: ${index}`),
		}));
	}

	<template>
		<div class="ms-frame"><div class="ms-dossier">
				<div
					class="ms-map
						{{if
							this.point
							'ms-map--placed'
						}}"
				>
					<span
						class="ms-map-label"
						role="img"
						aria-label={{this.caption}}
					></span>
					<svg
						class="ms-world"
						viewBox={{this.viewBox}}
						preserveAspectRatio="none"
						aria-hidden="true"
					>
						{{#each this.meridians as |x|}}
							<line
								class="ms-grid"
								x1={{x}}
								x2={{x}}
								y1="0"
								y2={{this.height}}
							/>
						{{/each}}
						{{#each this.parallels as |y|}}
							<line
								class="ms-grid"
								x1="0"
								x2="360"
								y1={{y}}
								y2={{y}}
							/>
						{{/each}}
						<path
							class="ms-land"
							d={{this.land}}
						/>
						{{#if this.point}}
							<line
								class="ms-cross"
								x1={{this.point.x}}
								x2={{this.point.x}}
								y1="0"
								y2={{this.height}}
							/>
							<line
								class="ms-cross"
								x1="0"
								x2="360"
								y1={{this.point.y}}
								y2={{this.point.y}}
							/>
						{{/if}}
					</svg>
					{{#if this.point}}
						<span
							class="ms-pin"
							style={{this.pinStyle}}
						></span>
					{{/if}}
					<span
						class="ms-caption
							{{this.captionClass}}
							{{if
								this.removed
								'ms-caption--removed'
							}}"
					>{{this.caption}}</span>
				</div>
				<ul class="ms-lamps" aria-hidden="true">
					{{#each this.lamps as |lamp|}}
						<li
							class="ms-lamp ms-lamp--{{lamp.state}}"
							style={{lamp.style}}
						>
							<span
								class="ms-lamp-light"
							><IconSvg
									@name="check"
								/></span>
							<span
								class="ms-lamp-name"
							>{{lamp.name}}</span>
						</li>
					{{/each}}
				</ul>
			</div></div>
	</template>
}
