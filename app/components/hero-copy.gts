import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { BUILT_WITH } from 'delphitools-v2/components/about-delphitools';

// Brand marks for the flip-card tiles, from simple-icons (MIT), fill swapped
// to currentColor so they follow the app's icon colouring like lucide's do.
const EMBER_ICON = htmlSafe(
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M0 0v24h24V0H0zm12.29 4.38c1.66-.03 2.83.42 3.84 1.85 2.25 5.58-6 8.4-6 8.4s-.23 1.48 2.02 1.42c2.78 0 5.7-2.15 6.81-3.06a.66.66 0 01.9.05l.84.87a.66.66 0 01.01.9c-.72.8-2.42 2.46-4.97 3.53 0 0-4.26 1.97-7.13.1a4.95 4.95 0 01-2.38-3.83s-2.08-.11-3.42-.63c-1.33-.52.01-2.1.01-2.1s.42-.65 1.2 0 2.24.36 2.24.36c.13-1.03.35-2.38.98-3.81 1.34-3 3.38-4.01 5.05-4.05zm.33 2.8c-1.1.07-2.8 1.78-2.88 4.93 0 0 .75.23 2.41-.91 1.67-1.14 2-2.97 1.11-3.81a.82.82 0 00-.64-.21Z"/></svg>',
);
// crayon-css has no brand mark of its own, so this is Ruby's own crayon
// glyph rather than an unrelated company's "Crayon" logo.
const CRAYON_ICON = htmlSafe(
	'<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><g transform="matrix(1,0,0,1,-4.9996,-10.0009)"><g transform="matrix(1,0,0,1,5,10)"><path d="M37.074,85.879L44.965,77.992L22.008,55.039L14.121,62.926L16.301,65.106L-0,92.176L7.824,100L34.894,83.699L37.074,85.879Z" style="fill-rule:nonzero;"/></g><g transform="matrix(1,0,0,1,5,10)"><path d="M86.172,36.785L63.215,13.828L26.695,50.351L49.652,73.304L86.172,36.785ZM45.317,54.683C41.977,51.343 44.243,43.66 50.383,37.519C56.524,31.378 64.207,29.113 67.547,32.453C70.887,35.792 68.618,43.48 62.481,49.617C56.344,55.757 48.657,58.023 45.317,54.683Z" style="fill-rule:nonzero;"/></g><g transform="matrix(1,0,0,1,5,10)"><path d="M96.785,26.168C101.07,21.875 101.07,14.922 96.785,10.625L89.379,3.215C85.086,-1.07 78.133,-1.07 73.836,3.215L67.898,9.141L90.859,32.102L96.785,26.168Z" style="fill-rule:nonzero;"/></g></g></svg>',
);
const SHADCN_ICON = htmlSafe(
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M22.219 11.784 11.784 22.219c-.407.407-.407 1.068 0 1.476.407.407 1.068.407 1.476 0L23.695 13.26c.407-.408.407-1.069 0-1.476-.408-.407-1.069-.407-1.476 0ZM20.132.305.305 20.132c-.407.407-.407 1.068 0 1.476.408.407 1.069.407 1.476 0L21.608 1.781c.407-.407.407-1.068 0-1.476-.408-.407-1.069-.407-1.476 0Z"/></svg>',
);
const LUCIDE_ICON = htmlSafe(
	'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M18.483 1.123a1.09 1.09 0 0 0-.752.362 1.09 1.09 0 0 0 .088 1.54 11.956 11.956 0 0 1 4 8.946 7.62 7.62 0 0 1-7.637 7.636 7.62 7.62 0 0 1-7.637-7.636 3.255 3.255 0 0 1 3.273-3.273c1.82 0 3.273 1.45 3.273 3.273a1.09 1.09 0 0 0 1.09 1.09 1.09 1.09 0 0 0 1.092-1.09c0-3-2.455-5.455-5.455-5.455s-5.454 2.455-5.454 5.455c0 5.408 4.408 9.818 9.818 9.818 5.41 0 9.818-4.41 9.818-9.818A14.16 14.16 0 0 0 19.272 1.4a1.09 1.09 0 0 0-.789-.277ZM9.818 2.15C4.408 2.151 0 6.561 0 11.97a14.16 14.16 0 0 0 4.8 10.637 1.09 1.09 0 0 0 1.54-.096 1.09 1.09 0 0 0-.095-1.54 11.957 11.957 0 0 1-4.063-9 7.62 7.62 0 0 1 7.636-7.637 7.62 7.62 0 0 1 7.637 7.636 3.256 3.256 0 0 1-3.273 3.273 3.256 3.256 0 0 1-3.273-3.273 1.09 1.09 0 0 0-1.09-1.09 1.09 1.09 0 0 0-1.092 1.09c0 3 2.455 5.455 5.455 5.455s5.454-2.455 5.454-5.455c0-5.408-4.408-9.818-9.818-9.818z"/></svg>',
);

function withUrl(name: string) {
	return BUILT_WITH.find((lib) => lib.name === name)!.url;
}

// The "important ones" for the flip tease; the full stack is one tap away
// in the About dialog (and ACKNOWLEDGEMENTS.md, linked below).
const STACK = [
	{ name: 'Ember', url: withUrl('Ember'), icon: EMBER_ICON },
	{ name: 'Crayon', url: withUrl('Crayon'), icon: CRAYON_ICON },
	{ name: 'shadcn', url: withUrl('shadcn-ember'), icon: SHADCN_ICON },
	{ name: 'Lucide', url: withUrl('Lucide'), icon: LUCIDE_ICON },
];

// The doodle tagline under the omnibox. A cover button behind the text flips
// it to a tile wall of what the app is built with; the real links (the
// "open source" mention, the tiles, the acknowledgements note) sit in a
// pointer-events layer above it, so they stay independently clickable.
export default class HeroCopy extends Component {
	@tracked flipped = false;

	toggle = () => {
		this.flipped = !this.flipped;
	};

	get frontInert() {
		return this.flipped ? true : undefined;
	}

	get backInert() {
		return this.flipped ? undefined : true;
	}

	<template>
		<div class="dt-hero-flip {{if this.flipped 'is-flipped'}}">
			<div class="dt-hero-flip-inner">
				<div
					class="dt-hero-flip-face is-front"
					inert={{this.frontInert}}
				>
					<button
						type="button"
						class="dt-hero-flip-cover"
						aria-label="Built with"
						{{on "click" this.toggle}}
					></button>
					<div class="dt-hero-flip-content">
						<p class="dt-hero-lead">
							A collection of small,
							low stakes and low
							effort tools.
						</p>
						<p>
							No logins, no paywalls,
							no data collection,
							forever.
							<br />
							Fully
							<a
								href="https://github.com/1612elphi/delphitools"
							>open source</a>, 0-BSD
							licensed for anyone.
							<br />
							Long live the handmade
							web.
						</p>
					</div>
				</div>
				<div
					class="dt-hero-flip-face is-back"
					inert={{this.backInert}}
				>
					<button
						type="button"
						class="dt-hero-flip-cover"
						aria-label="Back"
						{{on "click" this.toggle}}
					></button>
					<div class="dt-hero-flip-content">
						<p
							class="dt-hero-flip-hint"
						>Built with</p>
						<div class="dt-hero-tiles">
							{{#each STACK as |lib|}}
								<a
									href={{lib.url}}
									target="_blank"
									rel="noopener noreferrer"
									class="dt-hero-tile"
								>
									<span
										class="dt-icon"
										aria-hidden="true"
									>{{lib.icon}}</span>
									{{lib.name}}
								</a>
							{{/each}}
						</div>
						<p class="dt-hero-flip-more">
							Plus
							<a
								href="https://github.com/1612elphi/delphitools/blob/main/ACKNOWLEDGEMENTS.md"
								target="_blank"
								rel="noopener noreferrer"
							>many more open source
								libraries</a>.
						</p>
					</div>
				</div>
			</div>
		</div>
	</template>
}
