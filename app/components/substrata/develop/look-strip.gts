import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { SHELF, thumbsOf } from './render';

interface LookStripSignature {
	Args: {
		blobHash: string;
		active: string | null;
		lutEpoch: number;
		onPick: (id: string | null) => void;
	};
}

const swatchStyle = (swatch: readonly string[] | undefined) =>
	swatch
		? htmlSafe(
				`background: linear-gradient(135deg, ${swatch[0]}, ${swatch[1]} 55%, ${swatch[2]})`,
			)
		: undefined;

let memo: { key: string; value: Record<string, string> } | null = null;

function cachedThumbs(blobHash: string, epoch: number) {
	const key = `${blobHash}|${epoch}`;
	if (memo?.key !== key) memo = { key, value: thumbsOf(blobHash) };
	return memo.value;
}

export default class LookStrip extends Component<LookStripSignature> {
	get thumbs(): Record<string, string> {
		return cachedThumbs(this.args.blobHash, this.args.lutEpoch);
	}

	get tiles() {
		const thumbs = this.thumbs;
		return [
			{
				id: null,
				label: 'None',
				image: thumbs[''],
				swatch: undefined,
			},
			...SHELF.map((look) => ({
				id: look.id,
				label: look.label,
				image: thumbs[look.id],
				swatch: look.swatch,
			})),
		];
	}

	isActive = (id: string | null) => this.args.active === id;

	<template>
		<div class="sub-dev-looks" role="group" aria-label="Looks">
			{{#each this.tiles key="label" as |tile|}}
				<button
					type="button"
					class="sub-dev-look
						{{if
							(this.isActive tile.id)
							'is-active'
						}}"
					aria-pressed={{if
						(this.isActive tile.id)
						"true"
						"false"
					}}
					data-look={{if tile.id tile.id "none"}}
					{{on "click" (fn @onPick tile.id)}}
				>
					<span
						class="sub-dev-look-thumb"
						style={{swatchStyle
							tile.swatch
						}}
					>
						{{#if tile.image}}
							<img
								src={{tile.image}}
								alt=""
							/>
						{{/if}}
					</span>
					<span
						class="sub-dev-look-name"
					>{{tile.label}}</span>
				</button>
			{{/each}}
		</div>
	</template>
}
