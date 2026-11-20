import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDialog from 'delphicanon/components/canon-dialog';
import CanonSheet from 'delphicanon/components/canon-sheet';
import { IconSvg } from 'delphitools-v2/components/icon';
import type ThemeService from 'delphitools-v2/services/theme';
import './pages.css';

const WHAT =
	'Templates are made out of **Strata**. Strata are layers that can be changed, within reason. They are locked in position, but not in content. For example, a text Stratum lets you change the text, but not position or font. An image Stratum lets you **fill in a shape with an image** by dropping it in.';

const HOW =
	'Right click a layer in the Layers panel and find the **"Make Stratum"** option under More Options to make a layer into a reusable Stratum.';

const FRAMES =
	"An image stratum acts like an image frame. You can drop an image into it, and it will conform to the Stratum's shape and apply the Stratum's FX.";

const NEXT =
	"Make at least one Stratum, then save the template again through this menu. We'll be here.";

const runs = (text: string) =>
	text
		.split(/\*\*(.+?)\*\*/)
		.map((run, i) => ({ run, bold: i % 2 === 1 }));

const SLIDES = [
	{
		id: 'what',
		text: WHAT,
		src: 'layers',
		themed: true,
		w: 1200,
		h: 1027,
	},
	{ id: 'how', text: HOW, src: 'menu', themed: true, w: 632, h: 424 },
	{
		id: 'frames',
		text: FRAMES,
		src: 'frames',
		themed: false,
		w: 992,
		h: 600,
	},
	{ id: 'next', text: NEXT, src: 'save', themed: true, w: 632, h: 232 },
];

export default class StrataHelp extends Component<{
	Args: { open: boolean; phone: boolean; onClose: () => void };
}> {
	@service declare theme: ThemeService;
	@tracked slide = 0;

	slides = SLIDES;

	get current() {
		return SLIDES[this.slide]!;
	}

	get art() {
		const { src, themed } = this.current;
		const name = themed
			? `${src}-${this.theme.dark ? 'dark' : 'light'}`
			: src;
		return `/substrata/strata-help/${name}.webp`;
	}

	get first() {
		return this.slide === 0;
	}

	get last() {
		return this.slide === SLIDES.length - 1;
	}

	dotOn = (index: number) => index === this.slide;

	back = () => {
		this.slide = Math.max(0, this.slide - 1);
	};

	next = () => {
		if (this.last) this.close();
		else this.slide += 1;
	};

	close = () => {
		this.slide = 0;
		this.args.onClose();
	};

	<template>
		{{#let (if @phone CanonSheet CanonDialog) as |Frame|}}
			<Frame
				class="sub-pg-onb is-fit"
				@open={{@open}}
				@title="Strata"
				@onClose={{this.close}}
			>
				<:default>
					<div
						class="sub-pg-onb-page"
						data-slide={{this.current.id}}
					>
						<img
							src={{this.art}}
							alt=""
							width={{this.current.w}}
							height={{this.current.h}}
							class="sub-pg-onb-art"
						/>
						<p>{{#each
								(runs
									this.current.text
								)
								as |r|
							}}{{#if r.bold}}<strong
									>{{r.run}}</strong>{{else}}{{r.run}}{{/if}}{{/each}}</p>
					</div>
				</:default>
				<:footer>
					<div class="sub-pg-onb-bar">
						<CanonButton
							@kind="cell"
							@text="Back"
							@icon={{component
								IconSvg
								name="chevron-left"
							}}
							@disabled={{this.first}}
							@onClick={{this.back}}
						/>
						<span
							class="sub-pg-onb-dots"
							aria-hidden="true"
						>
							{{#each
								this.slides
								as |s i|
							}}
								<span
									class="sub-pg-onb-dot
										{{if
											(this.dotOn
												i
											)
											'is-on'
										}}"
									data-slide={{s.id}}
								></span>
							{{/each}}
						</span>
						<CanonButton
							@kind="primary"
							@text={{if
								this.last
								"Done"
								"Next"
							}}
							@onClick={{this.next}}
						/>
					</div>
				</:footer>
			</Frame>
		{{/let}}
	</template>
}
