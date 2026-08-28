import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { concat, hash } from '@ember/helper';
import { and, or } from 'ember-truth-helpers';
import type { TOC } from '@ember/component/template-only';

interface Sticker {
	file: string;
	label: string;
	rot: number;
	width: string;
	align: 'flex-start' | 'center' | 'flex-end';
}

const WALL_STICKERS: Sticker[] = [
	{
		file: 'chant',
		label: 'no login, no fee, these tools stay free',
		rot: 4,
		width: 'clamp(180px, 42vw, 260px)',
		align: 'center',
	},
	{
		file: 'trans',
		label: "I had my files' gender transed at delphi.tools",
		rot: -7,
		width: 'clamp(96px, 22vw, 132px)',
		align: 'flex-start',
	},
	{
		file: 'marker',
		label: 'delphi, sketched',
		rot: 6,
		width: 'clamp(120px, 30vw, 158px)',
		align: 'flex-end',
	},
	{
		file: 'policy',
		label: 'privacy policy: no data collected',
		rot: -4,
		width: 'clamp(170px, 40vw, 240px)',
		align: 'flex-start',
	},
	{
		file: 'saas-h8r',
		label: 'certified SaaS h8r',
		rot: 5,
		width: 'clamp(120px, 30vw, 158px)',
		align: 'flex-end',
	},
];

const LOUSY_STICKER: Sticker = {
	file: '',
	label: '',
	rot: -2.5,
	width: 'clamp(220px, 60vw, 360px)',
	align: 'center',
};

function downloadSticker(file: string) {
	const base = file.split('/').pop() ?? file;
	const a = document.createElement('a');
	a.href = `/stickers/${file}@2x.png`;
	a.download = `delphitools-${base}-sticker.png`;
	a.setAttribute('aria-hidden', 'true');
	document.body.appendChild(a);
	a.click();
	a.remove();
}

interface StickerButtonSignature {
	Element: HTMLButtonElement;
	Args: {
		sticker: Sticker;
		caption?: string;
	};
}

class StickerButton extends Component<StickerButtonSignature> {
	@tracked peeling = false;
	@tracked loaded = false;
	@tracked failed = false;

	get style() {
		return htmlSafe(
			`--dt-sticker-rot: ${this.args.sticker.rot}deg; width: ${this.args.sticker.width}; align-self: ${this.args.sticker.align};`,
		);
	}

	get src(): string {
		return `/stickers/${this.args.sticker.file}.png`;
	}

	handleLoad = () => {
		this.loaded = true;
	};

	handleError = () => {
		this.failed = true;
	};

	handleAnimationEnd = () => {
		this.peeling = false;
	};

	handleClick = () => {
		if (this.peeling) return;
		downloadSticker(this.args.sticker.file);
		if (
			window.matchMedia('(prefers-reduced-motion: reduce)')
				.matches
		) {
			return;
		}
		this.peeling = true;
	};

	<template>
		{{#unless this.failed}}
			<button
				type="button"
				class="dt-sticker-btn
					{{if this.peeling 'is-peeling'}}"
				style={{this.style}}
				aria-label="Peel off and download the {{@sticker.label}} sticker"
				title="Peel me off!"
				{{on "click" this.handleClick}}
			>
				<span
					class="dt-sticker-lift
						{{unless
							this.loaded
							'is-hidden'
						}}"
					{{on
						"animationend"
						this.handleAnimationEnd
					}}
				>
					<img
						src={{this.src}}
						alt=""
						class="dt-sticker-img"
						draggable={{false}}
						loading="lazy"
						decoding="async"
						{{on "load" this.handleLoad}}
						{{on "error" this.handleError}}
					/>
				</span>
			</button>
			{{#if (and this.loaded @caption)}}
				<p class="dt-sticker-caption">{{@caption}}</p>
			{{/if}}
		{{/unless}}
	</template>
}

interface PeelStickerSignature {
	Args: {
		tool: string;
		label?: string;
	};
}

const TOOL_STICKER_CAPTION = 'Have a sticker! Peel it off to download.';

const PeelSticker: TOC<PeelStickerSignature> = <template>
	<StickerButton
		@sticker={{hash
			file=(concat "lousy/" @tool)
			label=(or @label @tool)
			rot=LOUSY_STICKER.rot
			width=LOUSY_STICKER.width
			align=LOUSY_STICKER.align
		}}
		@caption={{TOOL_STICKER_CAPTION}}
	/>
</template>;

const WALL_HEADING = 'Stickers';

const WALL_BLURB =
	"Free for the taking. Peel one off and it'll download a high-res PNG for you to print it yourself!";

const StickerWall: TOC<{ Element: HTMLElement }> = <template>
	<section class="dt-sticker-wall">
		<h2 class="dt-sticker-wall-title">{{WALL_HEADING}}</h2>
		<p class="dt-sticker-wall-blurb">{{WALL_BLURB}}</p>
		<div class="dt-sticker-bin">
			{{#each WALL_STICKERS key="file" as |sticker|}}
				<StickerButton @sticker={{sticker}} />
			{{/each}}
		</div>
	</section>
</template>;

export { StickerWall, PeelSticker };
