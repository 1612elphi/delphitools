import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import Dialog from 'delphitools-v2/components/ui/dialog';
import Icon from 'delphitools-v2/components/icon';

// wording dictated by Ruby verbatim
const PILL_TEXT = 'welcome to delphitools 2.0!';

// ∑CG: slide 1 of the 2.0 what's-new popup, the greeting
//   spec: 1-3 sentences, the substrata onboarding voice; says this is version 2.0, the site was rewritten, everything still runs in the browser
//   sample: "This is delphitools 2.0: the whole site rebuilt from the ground up. Same tools, new engine, still all in your browser."
const SLIDE_HELLO = '∑CG';

// ∑CG: slide 2 of the 2.0 what's-new popup, Workflows
//   spec: 1-3 sentences; introduces Workflows (chained tools passing files along, the Flow State bar) and points at the Workflows page
//   sample: "Tools can chain now. Pick a workflow and each step hands its file to the next, no downloads in between."
const SLIDE_WORKFLOWS = '∑CG';

// ∑CG: slide 3 of the 2.0 what's-new popup, the new tools
//   spec: 1-3 sentences; mentions the newest tools (Image De-skewer, Morse, Braille, IPA, NATO chart, Substrata)
//   sample: "New on the shelf: an image de-skewer, Morse with playback, braille, IPA transcription and a NATO chart with real signal flags."
const SLIDE_TOOLS = '∑CG';

// ∑CG: slide 4 of the 2.0 what's-new popup, the sign-off
//   spec: 1-2 sentences; privacy unchanged (local, no tracking), thanks the visitor
//   sample: "Everything still runs locally and nothing is tracked, ever. Thanks for being here."
const SLIDE_THANKS = '∑CG';

const SLIDES = [SLIDE_HELLO, SLIDE_WORKFLOWS, SLIDE_TOOLS, SLIDE_THANKS];

/**
 * The 2.0 announcement: a rounded pill above the hero art (the one rounded
 * shape in the square system, Ruby 2026-08-23) opening a slide popup in the
 * shape of the Substrata onboarding.
 */
export default class WhatsNew extends Component {
	@tracked slide = 0;

	get current() {
		return SLIDES[this.slide] ?? SLIDES[0]!;
	}

	get atStart() {
		return this.slide === 0;
	}

	get atEnd() {
		return this.slide === SLIDES.length - 1;
	}

	back = () => {
		this.slide = Math.max(0, this.slide - 1);
	};

	next = () => {
		this.slide = Math.min(SLIDES.length - 1, this.slide + 1);
	};

	// Reopening starts over rather than on the slide it was closed on.
	reset = () => {
		this.slide = 0;
	};

	<template>
		<Dialog @onClose={{this.reset}} as |d|>
			<button
				type="button"
				class="dt-hero-pill"
				{{d.focusOnClose}}
				{{on "click" d.open}}
			>
				<Icon @name="party-popper" />
				{{PILL_TEXT}}
			</button>
			<d.Content class="dt-wn">
				<h2 class="dt-sr-only">delphitools 2.0</h2>
				<div class="dt-wn-slide">
					<p>{{this.current}}</p>
				</div>
				<div class="dt-wn-dots" aria-hidden="true">
					{{#each
						SLIDES key="@index"
						as |_slide index|
					}}
						<span
							class="dt-wn-dot
								{{if
									(eq
										index
										this.slide
									)
									'is-active'
								}}"
						></span>
					{{/each}}
				</div>
				<div class="dt-wn-footer">
					<button
						type="button"
						class="dt-wn-btn is-ghost"
						disabled={{this.atStart}}
						{{on "click" this.back}}
					>
						Back
					</button>
					{{#if this.atEnd}}
						<button
							type="button"
							class="dt-wn-btn is-primary"
							{{on "click" d.close}}
						>
							{{! the substrata onboarding's shipped label, reused }}
							let’s go
						</button>
					{{else}}
						<button
							type="button"
							class="dt-wn-btn is-primary"
							{{on "click" this.next}}
						>
							Next
						</button>
					{{/if}}
				</div>
			</d.Content>
		</Dialog>
	</template>
}
